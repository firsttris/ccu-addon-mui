package settings

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"errors"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// selfSigned makes a PEM file with a certificate for name and its key
func selfSigned(t *testing.T, name string) (certPEM, keyPEM string) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: name}, DNSNames: []string{name},
		NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(365 * 24 * time.Hour),
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	certPEM = string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
	keyPEM = string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}))
	return certPEM, keyPEM
}

func TestCertificate(t *testing.T) {
	dir := t.TempDir()
	s := New(dir)
	if info, err := s.Certificate(); err != nil || info.Exists {
		t.Fatalf("without file: %+v %v", info, err)
	}
	cert, key := selfSigned(t, "ccu.example.org")
	if err := s.SetCertificate(key + cert); err != nil {
		t.Fatal(err)
	}
	if st, _ := os.Stat(filepath.Join(dir, "server.pem")); st.Mode().Perm() != 0o600 {
		t.Errorf("mode %v", st.Mode())
	}
	info, err := s.Certificate()
	if err != nil || !info.Exists || info.Subject != "ccu.example.org" || !info.SelfSigned || info.DNSNames[0] != "ccu.example.org" {
		t.Fatalf("%+v %v", info, err)
	}
	if err := s.DeleteCertificate(); err != nil {
		t.Fatal(err)
	}
	if info, _ := s.Certificate(); info.Exists {
		t.Fatal("still there")
	}
}

func TestValidateCertificate(t *testing.T) {
	cert, key := selfSigned(t, "a")
	otherCert, _ := selfSigned(t, "b")
	ecKey, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	ecDER, _ := x509.MarshalECPrivateKey(ecKey)
	ecPEM := string(pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: ecDER}))
	for _, bad := range []string{cert, key, otherCert + key, cert + ecPEM, "nonsense"} {
		if err := ValidateCertificate(bad); !errors.Is(err, ErrInvalidCertificate) {
			t.Errorf("accepted: %v", err)
		}
	}
	if err := ValidateCertificate(cert + key); err != nil {
		t.Error(err)
	}
}
