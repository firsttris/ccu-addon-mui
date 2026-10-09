package ccurpc

import (
	"fmt"
	"net"
	"net/http"
	"net/url"
	"time"
)

// On openccu-lite the interface processes are reached through lite-rpc,
// occulited's proxy (docs/system-api.md "/api/rpc/v1 - lite-rpc"): one
// XML-RPC call per POST /api/rpc/v1/xmlrpc/{interface}, with a credential
// whose level the system checks for every call (reads rpc:read, setValue
// rpc:operate, paramsets, links and install mode rpc:configure, delete,
// re-key and firmware rpc:admin). The add-on's own token serves what the
// server does by itself; a change a user makes goes with that user's
// session (WithToken), so the system checks the user's level and its
// journal names the user. The answers come in UTF-8, the calls may carry
// any declared charset.
type proxy struct {
	base      string
	names     []string
	transport http.RoundTripper
	slow      http.RoundTripper
}

// NewProxy returns a client for the interfaces named, through lite-rpc at
// base (occulited's URL); token is the add-on's token, read for every call
func NewProxy(base string, names []string, token func() string) *Client {
	p := &proxy{
		base:  base,
		names: names,
		transport: &untypedValueTransport{base: &http.Transport{
			DialContext:           (&net.Dialer{Timeout: 5 * time.Second}).DialContext,
			ResponseHeaderTimeout: 30 * time.Second,
		}},
		slow: &untypedValueTransport{base: &http.Transport{
			DialContext:           (&net.Dialer{Timeout: 5 * time.Second}).DialContext,
			ResponseHeaderTimeout: firmwareUpdateTimeout,
		}},
	}
	callers, slow := p.callers(token)
	c := newClient(callers)
	c.slow = slow
	c.proxy = p
	return c
}

func (p *proxy) callers(token func() string) (map[string]caller, map[string]caller) {
	callers, slow := map[string]caller{}, map[string]caller{}
	for _, name := range p.names {
		u := fmt.Sprintf("%s/api/rpc/v1/xmlrpc/%s", p.base, url.PathEscape(name))
		callers[name] = newHTTPCaller(u, &bearerTransport{token: token, base: p.transport})
		slow[name] = newHTTPCaller(u, &bearerTransport{token: token, base: p.slow})
	}
	return callers, slow
}

// WithToken is the same client with another credential for its calls: a
// user's session, so that the system checks that user's level. It shares
// the descriptions. Without lite-rpc (a CCU) it is the client itself.
func (c *Client) WithToken(token string) *Client {
	if c.proxy == nil || token == "" {
		return c
	}
	callers, slow := c.proxy.callers(func() string { return token })
	return &Client{interfaces: callers, slow: slow, proxy: c.proxy, descriptions: c.descriptions}
}

// bearerTransport sends the credential as Authorization: Bearer
type bearerTransport struct {
	token func() string
	base  http.RoundTripper
}

func (t *bearerTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	// A RoundTripper must not modify the caller's request.
	clone := req.Clone(req.Context())
	if token := t.token(); token != "" {
		clone.Header.Set("Authorization", "Bearer "+token)
	}
	return t.base.RoundTrip(clone)
}
