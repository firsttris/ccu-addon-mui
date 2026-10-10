package websocket

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"ccu-addon-mui-server/pkg/audit"
	"ccu-addon-mui-server/pkg/diagrams"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/rega"
	"ccu-addon-mui-server/pkg/settings"
)

// SetDiagrams enables the diagrams
func (s *Server) SetDiagrams(store *diagrams.Store, recorder *diagrams.Recorder) {
	s.diagrams = store
	s.recorder = recorder
	recorder.SetWanted(store.Keys())
}

// RecordEvent hands a datapoint event to the diagrams
func (s *Server) RecordEvent(address, datapoint string, value any) {
	if s.recorder != nil {
		s.recorder.Record(address+"."+datapoint, value, time.Now())
	}
}

// RunSysvarRecording records the system variables in diagrams every
// interval; they send no events
func (s *Server) RunSysvarRecording(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.recordSysvars()
		}
	}
}

func (s *Server) recordSysvars() {
	if s.diagrams == nil || s.recorder == nil || !s.capabilities.Sysvars {
		return
	}
	wanted := false
	for key := range s.diagrams.Keys() {
		if strings.HasPrefix(key, diagrams.SysvarAddress+".") {
			wanted = true
		}
	}
	if !wanted {
		return
	}
	sysvars, err := s.regaClient.GetSysvars()
	if err != nil {
		logger.Error("Failed to read the system variables for the diagrams:", err)
		return
	}
	now := time.Now()
	for _, sv := range sysvars {
		s.recorder.Record(diagrams.SysvarAddress+"."+strconv.FormatInt(sv.ID, 10), sv.Value, now)
	}
}

type diagramsResponse struct {
	Type      string             `json:"type"`
	RequestID string             `json:"requestId,omitempty"`
	Diagrams  []diagrams.Diagram `json:"diagrams"`
	// For the costs of consumption (the WebUI's energy prices)
	EnergyPrice *settings.EnergyPrice `json:"energyPrice,omitempty"`
}

type diagramResponse struct {
	Type      string           `json:"type"`
	RequestID string           `json:"requestId,omitempty"`
	Success   bool             `json:"success"`
	Diagram   diagrams.Diagram `json:"diagram"`
}

type seriesData struct {
	Address   string `json:"address"`
	Datapoint string `json:"datapoint"`
	// [time (ms), average, minimum, maximum] per interval
	Points [][4]float64 `json:"points"`
}

type diagramDataResponse struct {
	Type      string       `json:"type"`
	RequestID string       `json:"requestId,omitempty"`
	Series    []seriesData `json:"series"`
}

// The most points per series in one answer
const maxBuckets = 2000

// handleDiagrams shows the diagrams and their values to everyone logged in
// and lets administrators change them (elevated, with audit log)
func (s *Server) handleDiagrams(client *Client, msgType string, message []byte) {
	var msg struct {
		RequestID string            `json:"requestId"`
		Diagram   diagrams.Diagram  `json:"diagram"`
		ID        string            `json:"id"`
		Series    []diagrams.Series `json:"series"`
		From      int64             `json:"from"`
		To        int64             `json:"to"`
		Buckets   int               `json:"buckets"`
	}
	if err := json.Unmarshal(message, &msg); err != nil {
		s.sendRequestError(client, msg.RequestID, "invalid message", "INVALID_REQUEST")
		return
	}
	if s.diagrams == nil || s.recorder == nil {
		s.sendRequestError(client, msg.RequestID, "diagrams are not available", "NOT_SUPPORTED")
		return
	}
	switch msgType {
	case "getDiagrams":
		response := diagramsResponse{Type: "getDiagrams_response", RequestID: msg.RequestID, Diagrams: s.diagrams.List()}
		if s.settings != nil {
			if price, err := s.settings.EnergyPrice(); err == nil && (price.Electricity > 0 || price.Gas > 0) {
				response.EnergyPrice = &price
			}
		}
		s.sendJSON(client, response)
	case "getDiagramData":
		if msg.To <= msg.From || msg.To-msg.From > 20*366*24*3600*1000 || len(msg.Series) == 0 || len(msg.Series) > diagrams.MaxSeries {
			s.sendRequestError(client, msg.RequestID, "invalid range", "INVALID_VALUE")
			return
		}
		buckets := msg.Buckets
		if buckets < 1 || buckets > maxBuckets {
			buckets = maxBuckets
		}
		response := diagramDataResponse{Type: "getDiagramData_response", RequestID: msg.RequestID, Series: []seriesData{}}
		for _, series := range msg.Series {
			data := seriesData{Address: series.Address, Datapoint: series.Datapoint, Points: [][4]float64{}}
			for _, p := range s.recorder.Query(series.Key(), msg.From/1000, msg.To/1000, buckets) {
				data.Points = append(data.Points, [4]float64{float64(p.T * 1000), p.Avg, p.Min, p.Max})
			}
			response.Series = append(response.Series, data)
		}
		s.sendJSON(client, response)
	case "saveDiagram":
		s.saveDiagram(client, msg.RequestID, msg.Diagram)
	case "deleteDiagram":
		entry := audit.Entry{User: client.user, Action: "deleteDiagram", Target: msg.ID}
		if !s.diagramAllowed(client, msg.RequestID, &entry) {
			return
		}
		previous, err := s.diagrams.Delete(msg.ID)
		if err != nil {
			s.diagramFailed(client, msg.RequestID, &entry, err)
			return
		}
		entry.Previous = previous
		entry.Target = previous.Name
		s.recordAudit(entry, rega.SetOK)
		s.recorder.SetWanted(s.diagrams.Keys())
		s.sendJSON(client, changeResponse{Type: "deleteDiagram_response", RequestID: msg.RequestID, Success: true})
	}
}

func (s *Server) diagramAllowed(client *Client, requestID string, entry *audit.Entry) bool {
	if code, errorMsg := configureError(client); code != "" {
		s.recordAudit(*entry, code)
		s.sendRequestError(client, requestID, errorMsg, code)
		return false
	}
	return true
}

func (s *Server) diagramFailed(client *Client, requestID string, entry *audit.Entry, err error) {
	code := "CCU_ERROR"
	switch {
	case errors.Is(err, diagrams.ErrInvalid):
		code = "INVALID_VALUE"
	case errors.Is(err, diagrams.ErrNotFound):
		code = "NOT_FOUND"
	}
	s.recordAudit(*entry, code)
	s.sendRequestError(client, requestID, entry.Action+" failed: "+err.Error(), code)
}

func (s *Server) recordAudit(entry audit.Entry, result string) {
	entry.Result = result
	if err := s.audit.Record(entry); err != nil {
		logger.Error("Failed to write the audit log:", err)
	}
}

func (s *Server) saveDiagram(client *Client, requestID string, d diagrams.Diagram) {
	entry := audit.Entry{User: client.user, Action: "saveDiagram", Target: d.Name, Value: d}
	if !s.diagramAllowed(client, requestID, &entry) {
		return
	}
	before := s.diagrams.Keys()
	saved, previous, err := s.diagrams.Save(d)
	if err != nil {
		s.diagramFailed(client, requestID, &entry, err)
		return
	}
	if previous != nil {
		entry.Previous = *previous
	}
	entry.Target = saved.Name
	s.recordAudit(entry, rega.SetOK)
	s.recorder.SetWanted(s.diagrams.Keys())
	var added []diagrams.Series
	for _, series := range saved.Series {
		if !before[series.Key()] && !s.recorder.HasData(series.Key()) {
			added = append(added, series)
		}
	}
	if len(added) > 0 {
		s.startSeries(added)
	}
	s.sendJSON(client, diagramResponse{Type: "saveDiagram_response", RequestID: requestID, Success: true, Diagram: saved})
}

// How many entries of the system protocol are searched for older values of
// a new series
const historyImportPages = 10

// startSeries fills new series: with the values the system protocol has of
// logged channels and with the current value. Without a system protocol
// (openccu-lite) only with the current value.
func (s *Server) startSeries(added []diagrams.Series) {
	if s.home == nil {
		return
	}
	channels, err := s.home.GetAllChannels()
	if err != nil {
		logger.Error("Failed to read the channels for the diagrams:", err)
		channels = nil
	}
	byAddress := map[string]rega.Channel{}
	for _, ch := range channels {
		byAddress[ch.Address] = ch
	}
	now := time.Now()
	for _, series := range added {
		if series.Address == diagrams.SysvarAddress {
			continue
		}
		ch, ok := byAddress[series.Address]
		if !ok {
			continue
		}
		var samples []diagrams.Sample
		for page := 0; s.capabilities.History && page < historyImportPages; page++ {
			entries, total, err := s.regaClient.GetHistory(page*500, 500, ch.ID)
			if err != nil {
				logger.Error("Failed to read the system protocol for the diagrams:", err)
				break
			}
			for _, e := range entries {
				if e.Kind != "channel" || e.Datapoint != series.Datapoint {
					continue
				}
				t, err := time.ParseInLocation("2006-01-02 15:04:05", e.Time, time.Local)
				v, ok := diagrams.ToFloat(e.Value)
				if err == nil && ok {
					samples = append(samples, diagrams.Sample{T: t.Unix(), V: v})
				}
			}
			if (page+1)*500 >= total {
				break
			}
		}
		if len(samples) > 0 {
			if err := s.recorder.Import(series.Key(), samples); err != nil {
				logger.Error("Failed to import older values into the diagrams:", err)
			}
		}
		if value, ok := ch.Datapoints[series.Datapoint]; ok {
			s.recorder.Record(series.Key(), value, now)
		}
	}
	s.recordSysvars()
}
