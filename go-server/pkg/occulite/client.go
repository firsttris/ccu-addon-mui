package occulite

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// Client calls occulited's APIs. The add-on's own token
// (/run/occulite/addon-tokens/<id>.api, minted at every start with the
// manifest's api_scopes) authorizes the calls the add-on makes for itself.
type Client struct {
	// BaseURL is occulited behind the system's web server, e.g.
	// http://127.0.0.1
	BaseURL string
	// TokenFile holds the add-on's token; read on every call, as it is
	// minted anew at every start
	TokenFile string
	HTTP      *http.Client
	// bearer replaces the add-on's token: a user's session (WithBearer)
	bearer string
}

// WithBearer is the same client calling with a user's session instead of
// the add-on's token: the system checks that user's level, and its journal
// names the user (Sebastian in #191)
func (c *Client) WithBearer(session string) *Client {
	if session == "" {
		return c
	}
	user := *c
	user.bearer = session
	return &user
}

// New returns a client for occulited at baseURL
func New(baseURL, tokenFile string) *Client {
	return &Client{
		BaseURL:   strings.TrimRight(baseURL, "/"),
		TokenFile: tokenFile,
		HTTP:      &http.Client{Timeout: 15 * time.Second},
	}
}

// Error is occulited's error answer: {error, message, detail}
type Error struct {
	Status  int
	Code    string `json:"error"`
	Message string `json:"message"`
	// The scope a 403 lacks
	Scope string `json:"scope"`
}

func (e *Error) Error() string {
	text := fmt.Sprintf("occulited: %d %s", e.Status, e.Code)
	if e.Message != "" {
		text += ": " + e.Message
	}
	if e.Scope != "" {
		text += " (scope " + e.Scope + ")"
	}
	return text
}

// Token is the add-on's token, read from its file every time: occulited
// may mint a new one
func (c *Client) Token() string { return c.token() }

func (c *Client) token() string {
	if c.bearer != "" {
		return c.bearer
	}
	if c.TokenFile == "" {
		return ""
	}
	data, err := os.ReadFile(c.TokenFile)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

// do sends a request with the add-on's token, or with bearer when given,
// and decodes a JSON answer into out (when not nil)
func (c *Client) do(ctx context.Context, method, path, bearer string, body, out any) error {
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.BaseURL+path, reader)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Accept", "application/json")
	if bearer == "" {
		bearer = c.token()
	}
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode == http.StatusNotModified {
		return nil
	}
	if resp.StatusCode >= 300 {
		apiErr := &Error{Status: resp.StatusCode}
		_ = json.Unmarshal(data, apiErr)
		return apiErr
	}
	if out == nil || len(data) == 0 {
		return nil
	}
	return json.Unmarshal(data, out)
}

// streamHeaderTimeout is how long a stream may take to answer its request:
// the streams have no timeout of their own, and their silence watch starts
// only with the answer. A variable for tests.
var streamHeaderTimeout = 30 * time.Second

// streamTransport is the transport of a stream: the client's when it has
// one (tests), else one that waits streamHeaderTimeout for the headers
func (c *Client) streamTransport() http.RoundTripper {
	if c.HTTP.Transport != nil {
		return c.HTTP.Transport
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.ResponseHeaderTimeout = streamHeaderTimeout
	return transport
}
