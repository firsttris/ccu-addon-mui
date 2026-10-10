package main

import (
	"bytes"
	"encoding/json"
	"net"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/santhosh-tekuri/jsonschema/v6"
)

// What the stack tests of both builds share (integration_test.go for a
// CCU, lite_integration_test.go for openccu-lite): free ports and
// requests over the WebSocket, whose answers are checked against
// protocol/schema.json.

// Ports handed out in this run: the listener is closed again at once, so
// the kernel may offer the same port to the next call, and two servers of
// one stack would then fight over it (address already in use)
var usedPorts sync.Map

func freePort(t *testing.T) int {
	t.Helper()
	for {
		l, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		port := l.Addr().(*net.TCPAddr).Port
		l.Close()
		if _, taken := usedPorts.LoadOrStore(port, true); !taken {
			return port
		}
	}
}

type message map[string]any

func send(t *testing.T, conn *websocket.Conn, m message) {
	t.Helper()
	if err := conn.WriteJSON(m); err != nil {
		t.Fatal(err)
	}
}

var (
	protocolOnce   sync.Once
	protocolSchema *jsonschema.Schema
)

// serverMessageSchema is the definition of every server message in
// protocol/schema.json, which the TypeScript types are generated from.
func serverMessageSchema(t *testing.T) *jsonschema.Schema {
	t.Helper()
	protocolOnce.Do(func() {
		compiler := jsonschema.NewCompiler()
		data, err := os.ReadFile("../protocol/schema.json")
		if err != nil {
			t.Fatal(err)
		}
		doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(data))
		if err != nil {
			t.Fatal(err)
		}
		if err := compiler.AddResource("schema.json", doc); err != nil {
			t.Fatal(err)
		}
		protocolSchema = compiler.MustCompile("schema.json#/definitions/ServerMessage")
	})
	return protocolSchema
}

// read reads the next message and checks it against the protocol schema:
// a server change that breaks the contract with the app fails here.
func read(t *testing.T, conn *websocket.Conn) (message, error) {
	t.Helper()
	_, data, err := conn.ReadMessage()
	if err != nil {
		return nil, err
	}
	instance, err := jsonschema.UnmarshalJSON(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("invalid JSON from the server: %s", data)
	}
	if err := serverMessageSchema(t).Validate(instance); err != nil {
		t.Fatalf("message does not match protocol/schema.json: %s\n%v", data, err)
	}
	var m message
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatal(err)
	}
	return m, nil
}

// receive reads messages until one matches.
func receive(t *testing.T, conn *websocket.Conn, match func(message) bool) message {
	t.Helper()
	_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	for {
		m, err := read(t, conn)
		if err != nil {
			t.Fatalf("no matching message: %v", err)
		}
		if match(m) {
			return m
		}
	}
}

func isAuthResponse(m message) bool { return m["type"] == "auth_response" }

// call sends a request and returns its answer: the message with its
// requestId, for auth and login the auth_response
func call(t *testing.T, conn *websocket.Conn, request message) message {
	t.Helper()
	send(t, conn, request)
	if request["type"] == "auth" || request["type"] == "login" {
		return receive(t, conn, isAuthResponse)
	}
	return receive(t, conn, byRequestID(request["requestId"].(string)))
}

func byRequestID(id string) func(message) bool {
	return func(m message) bool { return m["requestId"] == id }
}
