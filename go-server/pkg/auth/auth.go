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

type Authenticator struct {
	key        []byte
	webUIURL   string
	httpClient *http.Client
	now        func() time.Time

	mu          sync.Mutex
	failures    []time.Time
	lockedUntil time.Time
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

// Login verifies the credentials against the CCU and returns a token.
func (a *Authenticator) Login(username, password string) (string, error) {
	if err := a.checkLockout(); err != nil {
		return "", err
	}
	if username == "" {
		a.recordFailure()
		return "", ErrInvalidCredentials
	}

	ok, err := a.verifyWithCCU(username, password)
	if err != nil {
		return "", err
	}
	if !ok {
		a.recordFailure()
		return "", ErrInvalidCredentials
	}
	return a.issueToken(username), nil
}

// Refresh verifies a token and returns a new one with a fresh lifetime, so
// a device that is used regularly never has to log in again.
func (a *Authenticator) Refresh(token string) (user, newToken string, err error) {
	user, err = a.Verify(token)
	if err != nil {
		return "", "", err
	}
	return user, a.issueToken(user), nil
}

// Verify checks a token and returns the user it was issued to.
func (a *Authenticator) Verify(token string) (string, error) {
	payload, signature, ok := strings.Cut(token, ".")
	if !ok {
		return "", ErrInvalidToken
	}
	expected := a.sign(payload)
	if !hmac.Equal([]byte(signature), []byte(expected)) {
		return "", ErrInvalidToken
	}

	data, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		return "", ErrInvalidToken
	}
	var claims tokenClaims
	if err := json.Unmarshal(data, &claims); err != nil {
		return "", ErrInvalidToken
	}
	if a.now().After(time.Unix(claims.ExpiresAt, 0)) {
		return "", ErrInvalidToken
	}
	return claims.User, nil
}

type tokenClaims struct {
	User      string `json:"u"`
	ExpiresAt int64  `json:"exp"`
}

func (a *Authenticator) issueToken(username string) string {
	data, _ := json.Marshal(tokenClaims{User: username, ExpiresAt: a.now().Add(tokenLifetime).Unix()})
	payload := base64.RawURLEncoding.EncodeToString(data)
	return payload + "." + a.sign(payload)
}

func (a *Authenticator) sign(payload string) string {
	mac := hmac.New(sha256.New, a.key)
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
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
