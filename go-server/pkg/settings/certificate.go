package settings

import (
	"ccu-addon-mui-server/pkg/atomicfile"
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"
)

// The HTTPS certificate of the WebUI: /etc/config/server.pem with the
// certificate and its private key, as cp_network.cgi action_cert_upload
// stores it and lighttpd reads it; without it the CCU makes its own
const certificateFile = "server.pem"

// MaxCertificateSize is the largest file cp_network.cgi accepts
// (file_button maxlength)
const MaxCertificateSize = 1_000_000

var ErrInvalidCertificate = errors.New("the file needs a certificate and its private key")

// CertificateInfo describes the certificate in use
type CertificateInfo struct {
	// Exists is true for an own certificate (server.pem); otherwise the CCU
	// uses the one it generated
	Exists     bool       `json:"exists"`
	Subject    string     `json:"subject,omitempty"`
	Issuer     string     `json:"issuer,omitempty"`
	DNSNames   []string   `json:"dnsNames,omitempty"`
	NotBefore  *time.Time `json:"notBefore,omitempty"`
	NotAfter   *time.Time `json:"notAfter,omitempty"`
	SelfSigned bool       `json:"selfSigned,omitempty"`
}

// Certificate reads server.pem
func (s *Service) Certificate() (CertificateInfo, error) {
	data, err := os.ReadFile(s.path(certificateFile))
	if errors.Is(err, os.ErrNotExist) {
		return CertificateInfo{}, nil
	}
	if err != nil {
		return CertificateInfo{}, err
	}
	info := CertificateInfo{Exists: true}
	if cert := firstCertificate(data); cert != nil {
		info.Subject = cert.Subject.CommonName
		if info.Subject == "" {
			info.Subject = cert.Subject.String()
		}
		info.Issuer = cert.Issuer.CommonName
		if info.Issuer == "" {
			info.Issuer = cert.Issuer.String()
		}
		info.DNSNames = cert.DNSNames
		info.NotBefore, info.NotAfter = &cert.NotBefore, &cert.NotAfter
		info.SelfSigned = cert.Subject.String() == cert.Issuer.String()
	}
	return info, nil
}

func firstCertificate(data []byte) *x509.Certificate {
	for {
		var block *pem.Block
		block, data = pem.Decode(data)
		if block == nil {
			return nil
		}
		if block.Type == "CERTIFICATE" {
			cert, err := x509.ParseCertificate(block.Bytes)
			if err != nil {
				return nil
			}
			return cert
		}
	}
}

// ValidateCertificate checks a PEM file as action_cert_upload does (a
// certificate and an RSA or PKCS#8 private key) and also that the key
// belongs to the certificate, so lighttpd starts with it
func ValidateCertificate(data string) error {
	if len(data) > MaxCertificateSize {
		return fmt.Errorf("%w: too large", ErrInvalidCertificate)
	}
	lines := map[string]bool{}
	for _, line := range strings.Split(strings.ReplaceAll(data, "\r\n", "\n"), "\n") {
		lines[strings.TrimSpace(line)] = true
	}
	if !lines["-----BEGIN CERTIFICATE-----"] || (!lines["-----BEGIN RSA PRIVATE KEY-----"] && !lines["-----BEGIN PRIVATE KEY-----"]) {
		return ErrInvalidCertificate
	}
	if _, err := tls.X509KeyPair([]byte(data), []byte(data)); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidCertificate, err)
	}
	return nil
}

// SetCertificate stores an own certificate; lighttpd needs a restart
func (s *Service) SetCertificate(data string) error {
	if err := ValidateCertificate(data); err != nil {
		return err
	}
	// It holds the private key: readable only for root. Written atomically:
	// a half written file would keep lighttpd (WebUI and add-on) from starting
	return atomicfile.Write(s.path(certificateFile), []byte(data), 0o600)
}

// DeleteCertificate removes the own certificate (User.deleteCertificate);
// the CCU makes a new one when lighttpd restarts
func (s *Service) DeleteCertificate() error {
	err := os.Remove(s.path(certificateFile))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}
