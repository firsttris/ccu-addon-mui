// Package auth lets users log in with their CCU WebUI credentials, like
// RedMatic's "ReGaHSS" authentication. The CCU verifies the password; the
// server then issues its own long-lived token, so a wall tablet stays logged
// in without keeping a CCU session open.
package auth

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

const (
	tokenLifetime = 365 * 24 * time.Hour
	// Admin tokens allow changing settings and are short-lived: a wall
	// tablet stays logged in for operating, but setting up needs the
	// password again after a while.
	adminTokenLifetime = 8 * time.Hour

	// After maxFailures failed logins within failureWindow, logins are
	// refused for lockoutDuration to slow down password guessing.
	maxFailures     = 5
	failureWindow   = time.Minute
	lockoutDuration = time.Minute
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrTooManyAttempts    = errors.New("too many failed logins, try again later")
	ErrInvalidToken       = errors.New("invalid or expired token")
)

// User levels of the CCU. Stored in the token so that features can later
// be restricted (operating from "user", setting up only for "admin").
const (
	LevelAdmin   = "admin"
	LevelUser    = "user"
	LevelGuest   = "guest"
	LevelUnknown = ""
)

// LevelFromCCU maps the user level numbers ReGa uses to the levels above.
func LevelFromCCU(level int) string {
	switch level {
	case 8:
		return LevelAdmin
	case 2:
		return LevelUser
	case 1:
		return LevelGuest
	default:
		return LevelUnknown
	}
}

// LevelFunc looks up the CCU user level of a user, e.g. via ReGa.
type LevelFunc func(username string) (string, error)

// Token scopes
const (
	ScopeOperate = ""
	ScopeAdmin   = "admin"
)

var ErrNotAdmin = errors.New("only administrators may set up devices")

// Session is what a valid token says about its holder.
type Session struct {
	User  string
	Level string
	// Scope is ScopeOperate (long-lived) or ScopeAdmin (short-lived)
	Scope     string
	ExpiresAt time.Time
	// ID of the logged-in device (see EnableSessions); empty without
	ID string
}

type Authenticator struct {
	key        []byte
	webUIURL   string
	httpClient *http.Client
	now        func() time.Time
	level      LevelFunc

	mu          sync.Mutex
	failures    []time.Time
	lockedUntil time.Time
	store       *sessionStore
}

// New loads the signing key from keyFile, creating it on first start.
func New(webUIURL, keyFile string) (*Authenticator, error) {
	key, err := loadOrCreateKey(keyFile)
	if err != nil {
		return nil, err
	}
	return &Authenticator{
		key:        key,
		webUIURL:   strings.TrimSuffix(webUIURL, "/"),
		httpClient: &http.Client{Timeout: 10 * time.Second},
		now:        time.Now,
	}, nil
}

func loadOrCreateKey(keyFile string) ([]byte, error) {
	if data, err := os.ReadFile(keyFile); err == nil {
		key, err := hex.DecodeString(strings.TrimSpace(string(data)))
		if err == nil && len(key) >= 32 {
			return key, nil
		}
		return nil, fmt.Errorf("invalid auth key in %s", keyFile)
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}

	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	if err := os.WriteFile(keyFile, []byte(hex.EncodeToString(key)+"\n"), 0o600); err != nil {
		return nil, fmt.Errorf("failed to write auth key: %w", err)
	}
	return key, nil
}

// SetLevelFunc sets how the user level is looked up at login. Without it,
// tokens carry LevelUnknown.
func (a *Authenticator) SetLevelFunc(level LevelFunc) {
	a.level = level
}

// lookupLevel returns the user's level, or LevelUnknown if it can't be read:
// the level isn't enforced yet, so a failed lookup must not block the login.
func (a *Authenticator) lookupLevel(username string) string {
	if a.level == nil {
		return LevelUnknown
	}
	level, err := a.level(username)
	if err != nil {
		return LevelUnknown
	}
	return level
}

// Login verifies the credentials against the CCU and returns a token.
// device describes the device logging in, for the list of logged-in
// devices.
func (a *Authenticator) Login(username, password, device string) (Session, string, error) {
	if err := a.checkLockout(); err != nil {
		return Session{}, "", err
	}
	if username == "" {
		a.recordFailure()
		return Session{}, "", ErrInvalidCredentials
	}

	ok, err := a.verifyWithCCU(username, password)
	if err != nil {
		return Session{}, "", err
	}
	if !ok {
		a.recordFailure()
		return Session{}, "", ErrInvalidCredentials
	}
	session := Session{User: username, Level: a.lookupLevel(username)}
	a.mu.Lock()
	session.ID = a.startSession(username, device)
	a.mu.Unlock()
	return session, a.issueToken(session), nil
}

// Refresh verifies a token and returns a new one with a fresh lifetime, so
// a device that is used regularly never has to log in again. Tokens issued
// before levels were stored get the level looked up now.
func (a *Authenticator) Refresh(token, device string) (Session, string, error) {
	session, err := a.Verify(token)
	if err != nil {
		return Session{}, "", err
	}
	// Admin tokens expire for good; only the token for operating is renewed
	if session.Scope != ScopeOperate {
		return Session{}, "", ErrInvalidToken
	}
	// Logged out from another device
	if !a.checkSession(&session, device) {
		return Session{}, "", ErrInvalidToken
	}
	if session.Level == LevelUnknown {
		session.Level = a.lookupLevel(session.User)
	}
	return session, a.issueToken(session), nil
}

// Verify checks a token and returns the session it was issued for.
func (a *Authenticator) Verify(token string) (Session, error) {
	payload, signature, ok := strings.Cut(token, ".")
	if !ok {
		return Session{}, ErrInvalidToken
	}
	expected := a.sign(payload)
	if !hmac.Equal([]byte(signature), []byte(expected)) {
		return Session{}, ErrInvalidToken
	}

	data, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		return Session{}, ErrInvalidToken
	}
	var claims tokenClaims
	if err := json.Unmarshal(data, &claims); err != nil {
		return Session{}, ErrInvalidToken
	}
	if a.now().After(time.Unix(claims.ExpiresAt, 0)) {
		return Session{}, ErrInvalidToken
	}
	return Session{User: claims.User, Level: claims.Level, Scope: claims.Scope, ExpiresAt: time.Unix(claims.ExpiresAt, 0), ID: claims.ID}, nil
}

// IssueAdminToken returns a short-lived token for setting up, for a session
// that just proved its password. Only administrators get one.
func (a *Authenticator) IssueAdminToken(session Session) (string, error) {
	if session.Level != LevelAdmin {
		return "", ErrNotAdmin
	}
	session.Scope = ScopeAdmin
	return a.issueToken(session), nil
}

// VerifyAdmin checks that token is a valid admin token of user and returns
// when it expires.
func (a *Authenticator) VerifyAdmin(token, user string) (time.Time, bool) {
	session, err := a.Verify(token)
	if err != nil || session.Scope != ScopeAdmin || session.User != user || session.Level != LevelAdmin {
		return time.Time{}, false
	}
	if session.ID != "" && !a.checkSession(&session, "") {
		return time.Time{}, false
	}
	return session.ExpiresAt, true
}

// AdminTokenExpiry is when an admin token issued now expires.
func (a *Authenticator) AdminTokenExpiry() time.Time {
	return a.now().Add(adminTokenLifetime)
}

// Elevate checks the password of a logged-in user again and returns an
// admin token. Failed attempts count towards the lockout like logins.
// sessionID is the device the admin token is for.
func (a *Authenticator) Elevate(username, password, sessionID string) (string, error) {
	if err := a.checkLockout(); err != nil {
		return "", err
	}
	ok, err := a.verifyWithCCU(username, password)
	if err != nil {
		return "", err
	}
	if !ok {
		a.recordFailure()
		return "", ErrInvalidCredentials
	}
	return a.IssueAdminToken(Session{User: username, Level: a.lookupLevel(username), ID: sessionID})
}

// CheckPassword checks a user's password with the CCU, for changing it.
// Wrong passwords count towards the lockout like logins.
func (a *Authenticator) CheckPassword(username, password string) error {
	if err := a.checkLockout(); err != nil {
		return err
	}
	ok, err := a.verifyWithCCU(username, password)
	if err != nil {
		return err
	}
	if !ok {
		a.recordFailure()
		return ErrInvalidCredentials
	}
	return nil
}

type tokenClaims struct {
	User      string `json:"u"`
	Level     string `json:"l,omitempty"`
	Scope     string `json:"s,omitempty"`
	ID        string `json:"id,omitempty"`
	ExpiresAt int64  `json:"exp"`
}

func (a *Authenticator) issueToken(session Session) string {
	lifetime := tokenLifetime
	if session.Scope == ScopeAdmin {
		lifetime = adminTokenLifetime
	}
	data, _ := json.Marshal(tokenClaims{User: session.User, Level: session.Level, Scope: session.Scope, ID: session.ID, ExpiresAt: a.now().Add(lifetime).Unix()})
	payload := base64.RawURLEncoding.EncodeToString(data)
	return payload + "." + a.sign(payload)
}

func (a *Authenticator) sign(payload string) string {
	mac := hmac.New(sha256.New, a.key)
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// CheckLockout fails while too many wrong passwords lock out logins, for
// other places that check a password (backups).
func (a *Authenticator) CheckLockout() error {
	return a.checkLockout()
}

// RecordFailure counts a wrong password entered elsewhere towards the
// lockout.
func (a *Authenticator) RecordFailure() {
	a.recordFailure()
}

func (a *Authenticator) checkLockout() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.now().Before(a.lockedUntil) {
		return ErrTooManyAttempts
	}
	return nil
}

func (a *Authenticator) recordFailure() {
	a.mu.Lock()
	defer a.mu.Unlock()

	now := a.now()
	recent := a.failures[:0]
	for _, t := range a.failures {
		if now.Sub(t) < failureWindow {
			recent = append(recent, t)
		}
	}
	a.failures = append(recent, now)
	if len(a.failures) >= maxFailures {
		a.lockedUntil = now.Add(lockoutDuration)
		a.failures = nil
	}
}

type rpcResponse struct {
	Result interface{} `json:"result"`
	Error  *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// verifyWithCCU logs in via the WebUI's JSON-RPC API and logs out right
// away: the CCU only allows a few sessions at a time.
func (a *Authenticator) verifyWithCCU(username, password string) (bool, error) {
	var login rpcResponse
	if err := a.call("Session.login", map[string]string{"username": username, "password": password}, &login); err != nil {
		return false, err
	}
	sessionID, ok := login.Result.(string)
	if login.Error != nil || !ok || sessionID == "" {
		return false, nil
	}

	var logout rpcResponse
	_ = a.call("Session.logout", map[string]string{"_session_id_": sessionID}, &logout)
	return true, nil
}

func (a *Authenticator) call(method string, params interface{}, result *rpcResponse) error {
	body, _ := json.Marshal(map[string]interface{}{"version": "1.1", "method": method, "params": params})
	resp, err := a.httpClient.Post(a.webUIURL+"/api/homematic.cgi", "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("CCU not reachable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("CCU returned status %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(result)
}
