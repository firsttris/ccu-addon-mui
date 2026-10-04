package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func testCertificate(t *testing.T, name string) string {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	template := &x509.Certificate{SerialNumber: big.NewInt(7), Subject: pkix.Name{CommonName: name}, NotBefore: time.Now(), NotAfter: time.Now().Add(24 * time.Hour)}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})) +
		string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}))
}

func TestStackCertificate(t *testing.T) {
	ccu, conn := startStack(t, "ccu")
	loginAs(t, conn, "Admin", "secret")
	send(t, conn, message{"type": "getCertificate", "requestId": "c1"})
	if c := receive(t, conn, byRequestID("c1"))["certificate"].(map[string]interface{}); c["exists"] != false {
		t.Fatalf("certificate: %v", c)
	}
	pemFile := testCertificate(t, "ccu.example.org")
	send(t, conn, message{"type": "uploadCertificate", "requestId": "c2", "pem": "-----BEGIN CERTIFICATE-----\nkaputt\n"})
	if m := receive(t, conn, byRequestID("c2")); m["code"] != "INVALID_VALUE" {
		t.Fatalf("invalid: %v", m)
	}
	send(t, conn, message{"type": "uploadCertificate", "requestId": "c3", "pem": pemFile})
	if m := receive(t, conn, byRequestID("c3")); m["code"] != "PASSWORD_REQUIRED" {
		t.Fatalf("without password: %v", m)
	}
	if _, err := os.Stat(filepath.Join(ccu.ConfigDir, "server.pem")); err == nil {
		t.Fatal("written without a session")
	}
	send(t, conn, message{"type": "uploadCertificate", "requestId": "c4", "pem": pemFile, "password": "secret"})
	if m := receive(t, conn, byRequestID("c4")); m["success"] != true {
		t.Fatalf("upload: %v", m)
	}
	send(t, conn, message{"type": "getCertificate", "requestId": "c5"})
	if c := receive(t, conn, byRequestID("c5"))["certificate"].(map[string]interface{}); c["exists"] != true || c["subject"] != "ccu.example.org" || c["selfSigned"] != true {
		t.Fatalf("after upload: %v", c)
	}
	// lighttpd restarts after the answer
	deadline := time.Now().Add(5 * time.Second)
	for ccu.CallCount("JSON User.restartLighttpd") == 0 && time.Now().Before(deadline) {
		time.Sleep(50 * time.Millisecond)
	}
	if ccu.CallCount("JSON User.restartLighttpd") != 1 {
		t.Fatal("lighttpd not restarted")
	}
	send(t, conn, message{"type": "deleteCertificate", "requestId": "c6"})
	if m := receive(t, conn, byRequestID("c6")); m["success"] != true {
		t.Fatalf("delete: %v", m)
	}
	if _, err := os.Stat(filepath.Join(ccu.ConfigDir, "server.pem")); err == nil {
		t.Fatal("not deleted")
	}
}
