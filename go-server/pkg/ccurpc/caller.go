package ccurpc

import (
	"fmt"
	"io"
	"net/http"

	"github.com/kolo/xmlrpc"
)

// httpCaller makes XML-RPC calls with kolo/xmlrpc's encoding, each in its
// own HTTP request. kolo's own client runs the whole request inside
// net/rpc's request mutex (clientCodec.WriteRequest), so one slow call
// (getParamset of an unreachable device, up to the 30 s answer timeout)
// held up every other call to the same interface, from every app.
type httpCaller struct {
	url    string
	client *http.Client
}

func newHTTPCaller(url string, transport http.RoundTripper) *httpCaller {
	return &httpCaller{url: url, client: &http.Client{Transport: transport}}
}

func (c *httpCaller) Call(method string, args interface{}, reply interface{}) error {
	req, err := xmlrpc.NewRequest(c.url, method, args)
	if err != nil {
		return err
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("request error: bad status code - %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	response := xmlrpc.Response(body)
	// A fault reads "Fault(code): message", see faultCode
	if err := response.Err(); err != nil {
		return err
	}
	if reply == nil {
		return nil
	}
	return response.Unmarshal(reply)
}
