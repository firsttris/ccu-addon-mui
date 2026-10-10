package websocket

import (
	"encoding/json"
	"fmt"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/ccurpc"
	"ccu-addon-mui-server/pkg/rega"
)

type linksResponse struct {
	Type        string                     `json:"type"`
	RequestID   string                     `json:"requestId,omitempty"`
	Success     bool                       `json:"success"`
	Links       []ccurpc.Link              `json:"links,omitempty"`
	Description ccurpc.ParamsetDescription `json:"description,omitempty"`
	Values      map[string]any             `json:"values,omitempty"`
}

// handleLinks: direct links and their parameters. Reading is for
// administrators, changing needs the admin token too.
func (s *Server) handleLinks(client *Client, msgType string, message []byte) {
	rpc := s.rpcFor(client)
	var msg struct {
		RequestID     string         `json:"requestId"`
		InterfaceName string         `json:"interfaceName"`
		Address       string         `json:"address"`
		Partner       string         `json:"partner"`
		Sender        string         `json:"sender"`
		Receiver      string         `json:"receiver"`
		Name          string         `json:"name"`
		Values        map[string]any `json:"values"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	if s.rpc == nil {
		s.sendRequestError(client, msg.RequestID, msgType+" is not available", "NOT_AVAILABLE")
		return
	}
	respond := func(r linksResponse, err error) {
		if err != nil {
			s.sendRequestError(client, msg.RequestID, msgType+" failed: "+err.Error(), "CCU_ERROR")
			return
		}
		r.Type, r.RequestID, r.Success = msgType+"_response", msg.RequestID, true
		s.sendJSON(client, r)
	}

	switch msgType {
	case "getLinks", "getLinkParamsetDescription", "getLinkParamset":
		if client.level != auth.LevelAdmin {
			s.sendRequestError(client, msg.RequestID, "only administrators may set up devices", "FORBIDDEN")
			return
		}
	}

	switch msgType {
	case "getLinks":
		links, err := rpc.GetLinks(msg.InterfaceName, msg.Address)
		respond(linksResponse{Links: links}, err)
	case "getLinkParamsetDescription":
		description, err := rpc.GetLinkParamsetDescription(msg.InterfaceName, msg.Address, msg.Partner)
		respond(linksResponse{Description: description}, err)
	case "getLinkParamset":
		values, err := rpc.GetLinkParamset(msg.InterfaceName, msg.Address, msg.Partner)
		respond(linksResponse{Values: values}, err)
	case "addLink":
		entry := audit.Entry{Action: msgType, Target: msg.Sender + " > " + msg.Receiver, Value: msg.Name}
		s.configure(client, msg.RequestID, entry, func() (any, string, error) {
			return nil, rega.SetOK, rpc.AddLink(msg.InterfaceName, msg.Sender, msg.Receiver, msg.Name, "")
		})
	case "removeLink":
		entry := audit.Entry{Action: msgType, Target: msg.Sender + " > " + msg.Receiver}
		s.configure(client, msg.RequestID, entry, func() (any, string, error) {
			return nil, rega.SetOK, rpc.RemoveLink(msg.InterfaceName, msg.Sender, msg.Receiver)
		})
	case "putLinkParamset":
		entry := audit.Entry{Action: msgType, Target: msg.Address + " < " + msg.Partner}
		s.configure(client, msg.RequestID, entry, func() (any, string, error) {
			description, err := rpc.GetLinkParamsetDescription(msg.InterfaceName, msg.Address, msg.Partner)
			if err != nil {
				return nil, "", err
			}
			values, err := ccurpc.CoerceValues(description, msg.Values)
			if err != nil {
				return nil, "", fmt.Errorf("invalid value: %w", err)
			}
			entry.Value = values
			var previous map[string]any
			if current, err := rpc.GetLinkParamset(msg.InterfaceName, msg.Address, msg.Partner); err == nil {
				previous = map[string]any{}
				for name := range values {
					previous[name] = current[name]
				}
			}
			return previous, rega.SetOK, rpc.PutLinkParamset(msg.InterfaceName, msg.Address, msg.Partner, values)
		})
	}
}

type interfaceLink struct {
	InterfaceName string `json:"interfaceName"`
	ccurpc.Link
}

type allLinksResponse struct {
	Type      string          `json:"type"`
	RequestID string          `json:"requestId,omitempty"`
	Links     []interfaceLink `json:"links"`
}

// handleAllLinks lists the direct links of all interfaces, like the WebUI's
// "Direkte Verknüpfungen". Interfaces without links (or not reachable)
// are skipped, as the WebUI does. Setup, for administrators.
func (s *Server) handleAllLinks(client *Client, requestID string) {
	rpc := s.rpcFor(client)
	if client.level != auth.LevelAdmin {
		s.sendRequestError(client, requestID, "only administrators may set up devices", "FORBIDDEN")
		return
	}
	links := []interfaceLink{}
	for _, iface := range []string{"BidCos-RF", "HmIP-RF", "BidCos-Wired"} {
		found, err := rpc.GetAllLinks(iface)
		if err != nil {
			continue
		}
		for _, link := range found {
			links = append(links, interfaceLink{InterfaceName: iface, Link: link})
		}
	}
	s.sendJSON(client, allLinksResponse{Type: "getAllLinks_response", RequestID: requestID, Links: links})
}
