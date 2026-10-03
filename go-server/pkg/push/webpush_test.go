package push

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// A browser's side: a key pair and auth secret, and decryption (RFC 8291)
type browser struct {
	key  *ecdh.PrivateKey
	auth []byte
}

func newBrowser(t *testing.T) *browser {
	key, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	auth := make([]byte, 16)
	_, _ = rand.Read(auth)
	return &browser{key: key, auth: auth}
}

func (b *browser) subscription(endpoint string) Subscription {
	var s Subscription
	s.Endpoint = endpoint
	s.Keys.P256dh = base64.RawURLEncoding.EncodeToString(b.key.PublicKey().Bytes())
	s.Keys.Auth = base64.URLEncoding.EncodeToString(b.auth) // with padding, as some browsers send it
	return s
}

func (b *browser) decrypt(t *testing.T, body []byte) string {
	salt, rs, idlen := body[:16], binary.BigEndian.Uint32(body[16:20]), int(body[20])
	if rs != 4096 || idlen != 65 {
		t.Fatalf("header: rs %d idlen %d", rs, idlen)
	}
	asPublicBytes := body[21 : 21+idlen]
	asPublic, err := ecdh.P256().NewPublicKey(asPublicBytes)
	if err != nil {
		t.Fatal(err)
	}
	secret, _ := b.key.ECDH(asPublic)
	keyInfo := append(append(append([]byte("WebPush: info\x00"), b.key.PublicKey().Bytes()...), asPublicBytes...), 1)
	ikm := hmacSHA256(hmacSHA256(b.auth, secret), keyInfo)[:32]
	prk := hmacSHA256(salt, ikm)
	cek := hmacSHA256(prk, []byte("Content-Encoding: aes128gcm\x00\x01"))[:16]
	nonce := hmacSHA256(prk, []byte("Content-Encoding: nonce\x00\x01"))[:12]
	block, _ := aes.NewCipher(cek)
	gcm, _ := cipher.NewGCM(block)
	plain, err := gcm.Open(nil, nonce, body[21+idlen:], nil)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	if plain[len(plain)-1] != 2 {
		t.Fatalf("missing record delimiter")
	}
	return string(plain[:len(plain)-1])
}

// verifyJWT checks the VAPID token as a push service does
func verifyJWT(t *testing.T, header, publicKey, audience string) {
	if !strings.HasPrefix(header, "vapid t=") {
		t.Fatalf("authorization: %q", header)
	}
	parts := strings.SplitN(strings.TrimPrefix(header, "vapid t="), ", k=", 2)
	if parts[1] != publicKey {
		t.Fatalf("k = %q, want %q", parts[1], publicKey)
	}
	jwt := strings.Split(parts[0], ".")
	claims, _ := base64.RawURLEncoding.DecodeString(jwt[1])
	var c struct {
		Aud string `json:"aud"`
		Exp int64  `json:"exp"`
		Sub string `json:"sub"`
	}
	_ = json.Unmarshal(claims, &c)
	if c.Aud != audience || c.Exp < time.Now().Unix() || c.Sub == "" {
		t.Fatalf("claims: %+v", c)
	}
	keyBytes, _ := base64.RawURLEncoding.DecodeString(publicKey)
	x, y := elliptic.Unmarshal(elliptic.P256(), keyBytes) //nolint:staticcheck
	sig, _ := base64.RawURLEncoding.DecodeString(jwt[2])
	digest := sha256.Sum256([]byte(jwt[0] + "." + jwt[1]))
	if !ecdsa.Verify(&ecdsa.PublicKey{Curve: elliptic.P256(), X: x, Y: y}, digest[:], new(big.Int).SetBytes(sig[:32]), new(big.Int).SetBytes(sig[32:])) {
		t.Fatal("invalid signature")
	}
}

func TestSendEncryptsAndSigns(t *testing.T) {
	b := newBrowser(t)
	var got string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Content-Encoding") != "aes128gcm" || r.Header.Get("TTL") == "" {
			t.Errorf("headers: %v", r.Header)
		}
		body, _ := io.ReadAll(r.Body)
		got = b.decrypt(t, body)
		w.WriteHeader(http.StatusCreated)
	}))
	defer server.Close()

	vapid, err := NewVAPID("", "mailto:test@example.com")
	if err != nil {
		t.Fatal(err)
	}
	// The key survives a restart
	again, err := NewVAPID(base64.RawURLEncoding.EncodeToString(vapid.privateBytes()), "mailto:test@example.com")
	if err != nil || again.PublicKey() != vapid.PublicKey() {
		t.Fatalf("reloaded key differs: %v", err)
	}

	server.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		verifyJWT(t, r.Header.Get("Authorization"), vapid.PublicKey(), server.URL)
		body, _ := io.ReadAll(r.Body)
		got = b.decrypt(t, body)
		w.WriteHeader(http.StatusCreated)
	})
	if err := vapid.Send(server.Client(), b.subscription(server.URL+"/push/abc"), []byte(`{"title":"Wasseralarm"}`)); err != nil {
		t.Fatal(err)
	}
	if got != `{"title":"Wasseralarm"}` {
		t.Fatalf("payload: %q", got)
	}
}

func TestSendReportsGoneSubscriptions(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusGone) }))
	defer server.Close()
	vapid, _ := NewVAPID("", "mailto:test@example.com")
	if err := vapid.Send(server.Client(), newBrowser(t).subscription(server.URL), []byte("x")); err != ErrGone {
		t.Fatalf("expected ErrGone, got %v", err)
	}
}
