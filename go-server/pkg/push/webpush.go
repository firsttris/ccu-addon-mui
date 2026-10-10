// Package push sends Web Push notifications to the add-on's PWA: the
// encryption of RFC 8291 (aes128gcm) and the VAPID authentication of RFC
// 8292, with the standard library only.
package push

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Subscription is what the browser's PushManager.subscribe returns.
type Subscription struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

// b64 decodes base64url with or without padding (browsers send both).
func b64(s string) ([]byte, error) {
	s = strings.TrimRight(s, "=")
	return base64.RawURLEncoding.DecodeString(s)
}

func hmacSHA256(key, data []byte) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write(data)
	return mac.Sum(nil)
}

// encrypt encrypts a payload for a subscription (RFC 8291, one record).
func encrypt(sub Subscription, payload []byte, salt []byte, serverKey *ecdh.PrivateKey) ([]byte, error) {
	uaPublicBytes, err := b64(sub.Keys.P256dh)
	if err != nil {
		return nil, fmt.Errorf("invalid p256dh: %w", err)
	}
	authSecret, err := b64(sub.Keys.Auth)
	if err != nil || len(authSecret) != 16 {
		return nil, fmt.Errorf("invalid auth secret")
	}
	uaPublic, err := ecdh.P256().NewPublicKey(uaPublicBytes)
	if err != nil {
		return nil, fmt.Errorf("invalid p256dh: %w", err)
	}
	ecdhSecret, err := serverKey.ECDH(uaPublic)
	if err != nil {
		return nil, err
	}
	asPublic := serverKey.PublicKey().Bytes()

	// IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0 || ua_public || as_public, 32)
	prkKey := hmacSHA256(authSecret, ecdhSecret)
	keyInfo := append(append(append([]byte("WebPush: info\x00"), uaPublicBytes...), asPublic...), 1)
	ikm := hmacSHA256(prkKey, keyInfo)[:32]

	prk := hmacSHA256(salt, ikm)
	cek := hmacSHA256(prk, []byte("Content-Encoding: aes128gcm\x00\x01"))[:16]
	nonce := hmacSHA256(prk, []byte("Content-Encoding: nonce\x00\x01"))[:12]

	block, err := aes.NewCipher(cek)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	// The last (and only) record ends with the delimiter 2
	ciphertext := gcm.Seal(nil, nonce, append(append([]byte{}, payload...), 2), nil)

	var body bytes.Buffer
	body.Write(salt)
	_ = binary.Write(&body, binary.BigEndian, uint32(4096))
	body.WriteByte(byte(len(asPublic)))
	body.Write(asPublic)
	body.Write(ciphertext)
	return body.Bytes(), nil
}

// VAPID signs the requests to the push services (RFC 8292).
type VAPID struct {
	key *ecdsa.PrivateKey
	// The key's encodings, computed once: the uncompressed public point the
	// browser subscribes with and the 32 private bytes the store keeps
	public, private []byte
	// Subject: a contact for the push service, a mailto: or https: URL
	Subject string
}

func vapidOf(key *ecdsa.PrivateKey, subject string) (*VAPID, error) {
	public, err := key.PublicKey.Bytes()
	if err != nil {
		return nil, err
	}
	private, err := key.Bytes()
	if err != nil {
		return nil, err
	}
	return &VAPID{key: key, public: public, private: private, Subject: subject}, nil
}

// PublicKey is the application server key the browser subscribes with
// (uncompressed P-256 point, base64url).
func (v *VAPID) PublicKey() string { return encodeKey(v.public) }

func encodeKey(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func (v *VAPID) privateBytes() []byte { return v.private }

// NewVAPID creates a key, or loads one from its 32 private bytes (base64url).
func NewVAPID(private string, subject string) (*VAPID, error) {
	if private == "" {
		key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		if err != nil {
			return nil, err
		}
		return vapidOf(key, subject)
	}
	d, err := b64(private)
	if err != nil {
		return nil, fmt.Errorf("invalid VAPID key")
	}
	key, err := ecdsa.ParseRawPrivateKey(elliptic.P256(), d)
	if err != nil {
		return nil, fmt.Errorf("invalid VAPID key")
	}
	return vapidOf(key, subject)
}

// header returns the Authorization header for an endpoint.
func (v *VAPID) header(endpoint string, now time.Time) (string, error) {
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", fmt.Errorf("invalid endpoint")
	}
	head := base64.RawURLEncoding.EncodeToString([]byte(`{"typ":"JWT","alg":"ES256"}`))
	claims, _ := json.Marshal(map[string]any{
		"aud": u.Scheme + "://" + u.Host,
		"exp": now.Add(12 * time.Hour).Unix(),
		"sub": v.Subject,
	})
	unsigned := head + "." + base64.RawURLEncoding.EncodeToString(claims)
	digest := sha256.Sum256([]byte(unsigned))
	r, s, err := ecdsa.Sign(rand.Reader, v.key, digest[:])
	if err != nil {
		return "", err
	}
	signature := append(r.FillBytes(make([]byte, 32)), s.FillBytes(make([]byte, 32))...)
	jwt := unsigned + "." + base64.RawURLEncoding.EncodeToString(signature)
	return "vapid t=" + jwt + ", k=" + v.PublicKey(), nil
}

// ErrGone means the subscription is no longer valid and can be dropped.
var ErrGone = fmt.Errorf("subscription gone")

// Send delivers one notification. A 404 or 410 from the push service
// returns ErrGone.
func (v *VAPID) Send(client *http.Client, sub Subscription, payload []byte) error {
	serverKey, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		return err
	}
	salt := make([]byte, 16)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return err
	}
	body, err := encrypt(sub, payload, salt, serverKey)
	if err != nil {
		return err
	}
	auth, err := v.header(sub.Endpoint, time.Now())
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, sub.Endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", auth)
	req.Header.Set("Content-Encoding", "aes128gcm")
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("TTL", "86400")
	req.Header.Set("Urgency", "high")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	switch {
	case resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone:
		return ErrGone
	case resp.StatusCode >= 300:
		return fmt.Errorf("push service answered %s", resp.Status)
	}
	return nil
}
