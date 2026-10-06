package rules

import (
	"context"
	"strconv"
	"sync"
	"time"

	"ccu-addon-mui-server/pkg/atomicfile"
	"ccu-addon-mui-server/pkg/logger"
)

// Values reads the current values of a channel (XML-RPC getParamset VALUES),
// for datapoints that sent no event since the start.
type Values interface {
	GetParamset(iface, address, paramsetKey string) (map[string]interface{}, error)
}

// Engine evaluates the rules on every event and every tick.
type Engine struct {
	store  *Store
	values Values
	notify func(Rule)
	now    func() time.Time

	mu      sync.Mutex
	current map[string]float64
	// Since when a rule's conditions hold, and whether it notified since
	since map[string]time.Time
	fired map[string]bool
	// Channels whose values were read or failed recently
	loaded map[string]time.Time
	// Where the rules that notified are kept across restarts, "" for not
	statePath string
}

// state is what survives a restart: the rules that notified and since when
// their conditions hold. Written only when a rule notifies or stops
// holding after it did, so the flash isn't worn by every event.
type state struct {
	Fired map[string]time.Time `json:"fired"`
}

// KeepState keeps the rules that notified in path (next to the rules), so
// a restart doesn't notify them again while they still hold.
func (e *Engine) KeepState(path string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.statePath = path
	var st state
	if err := atomicfile.ReadJSON(path, &st); err != nil {
		return err
	}
	for id, since := range st.Fired {
		e.since[id] = since
		e.fired[id] = true
	}
	return nil
}

// saveState writes the rules that notified; e.mu must be held.
func (e *Engine) saveState() {
	if e.statePath == "" {
		return
	}
	st := state{Fired: map[string]time.Time{}}
	for id := range e.fired {
		st.Fired[id] = e.since[id]
	}
	if err := atomicfile.WriteJSON(e.statePath, st, 0o600); err != nil {
		logger.Error("Rules: saving the state failed:", err)
	}
}

// How long a failed read of a channel's values waits before the next try
const retryLoad = 5 * time.Minute

func NewEngine(store *Store, values Values, notify func(Rule)) *Engine {
	return &Engine{
		store: store, values: values, notify: notify, now: time.Now,
		current: map[string]float64{}, since: map[string]time.Time{}, fired: map[string]bool{}, loaded: map[string]time.Time{},
	}
}

// number turns an event value into the number conditions compare
func number(value interface{}) (float64, bool) {
	switch v := value.(type) {
	case bool:
		if v {
			return 1, true
		}
		return 0, true
	case int:
		return float64(v), true
	case int32:
		return float64(v), true
	case int64:
		return float64(v), true
	case float64:
		return v, true
	case string:
		f, err := strconv.ParseFloat(v, 64)
		return f, err == nil
	}
	return 0, false
}

// OnEvent takes a value the CCU sent and evaluates the rules. It runs in
// the CCU's event callback: give NewEngine a notify that doesn't block
// (Queue).
func (e *Engine) OnEvent(address, datapoint string, value interface{}) {
	n, ok := number(value)
	if !ok {
		return
	}
	key := address + "." + datapoint
	e.mu.Lock()
	e.current[key] = n
	e.mu.Unlock()
	for _, r := range e.store.List() {
		for _, c := range r.Conditions {
			if r.Enabled && c.Key() == key {
				// Without reading missing values: that would hold up the events
				e.evaluate(false)
				return
			}
		}
	}
}

func holds(c Condition, value float64) bool {
	switch c.Op {
	case "eq":
		return value == c.Value
	case "ne":
		return value != c.Value
	case "lt":
		return value < c.Value
	case "gt":
		return value > c.Value
	}
	return false
}

func minutesOf(clock string) int {
	h, _ := strconv.Atoi(clock[:2])
	m, _ := strconv.Atoi(clock[3:])
	return h*60 + m
}

// inWindow: the time lies in [From, To), across midnight if To is earlier
func inWindow(r Rule, t time.Time) bool {
	if r.From == "" {
		return true
	}
	now, from, to := t.Hour()*60+t.Minute(), minutesOf(r.From), minutesOf(r.To)
	if from < to {
		return now >= from && now < to
	}
	return now >= from || now < to
}

// load reads the values of the channels the rules need and have none of
func (e *Engine) load(rules []Rule) {
	type channel struct{ iface, address string }
	var missing []channel
	e.mu.Lock()
	seen := map[string]bool{}
	for _, r := range rules {
		if !r.Enabled {
			continue
		}
		for _, c := range r.Conditions {
			if _, ok := e.current[c.Key()]; ok || seen[c.Address] {
				continue
			}
			if at, ok := e.loaded[c.Address]; ok && e.now().Sub(at) < retryLoad {
				continue
			}
			seen[c.Address] = true
			missing = append(missing, channel{c.InterfaceName, c.Address})
		}
	}
	e.mu.Unlock()
	for _, ch := range missing {
		values, err := e.values.GetParamset(ch.iface, ch.address, "VALUES")
		e.mu.Lock()
		e.loaded[ch.address] = e.now()
		if err == nil {
			for name, value := range values {
				key := ch.address + "." + name
				if _, ok := e.current[key]; ok {
					continue
				}
				if n, ok := number(value); ok {
					e.current[key] = n
				}
			}
		}
		e.mu.Unlock()
		if err != nil {
			logger.Error("Rules: reading the values of "+ch.address+" failed:", err)
		}
	}
}

// Evaluate checks every rule and notifies those whose time has come. A rule
// notifies once; again only after its conditions stopped holding. Values
// that sent no event yet are read from the CCU first.
func (e *Engine) Evaluate() {
	e.evaluate(true)
}

func (e *Engine) evaluate(loadMissing bool) {
	rules := e.store.List()
	if loadMissing {
		e.load(rules)
	}
	now := e.now()
	var due []Rule
	e.mu.Lock()
	changed := false
	active := map[string]bool{}
	for _, r := range rules {
		if !r.Enabled {
			continue
		}
		active[r.ID] = true
		ok := inWindow(r, now)
		unknown := false
		for _, c := range r.Conditions {
			value, known := e.current[c.Key()]
			if !known {
				unknown = true
			} else if !holds(c, value) {
				ok = false
			}
		}
		// A value not read yet (just after a start) leaves the rule as it
		// is, unless another one already says the conditions don't hold
		if ok && unknown {
			continue
		}
		if !ok {
			changed = changed || e.fired[r.ID]
			delete(e.since, r.ID)
			delete(e.fired, r.ID)
			continue
		}
		start, ok := e.since[r.ID]
		if !ok {
			start = now
			e.since[r.ID] = now
		}
		if !e.fired[r.ID] && now.Sub(start) >= time.Duration(r.Minutes)*time.Minute {
			e.fired[r.ID] = true
			changed = true
			due = append(due, r)
		}
	}
	// Changed or deleted rules start over
	for id := range e.since {
		if !active[id] {
			changed = changed || e.fired[id]
			delete(e.since, id)
			delete(e.fired, id)
		}
	}
	if changed {
		e.saveState()
	}
	e.mu.Unlock()
	for _, r := range due {
		e.notify(r)
	}
}

// Reset forgets a rule's state, after it was changed
func (e *Engine) Reset(id string) {
	e.mu.Lock()
	wasFired := e.fired[id]
	delete(e.since, id)
	delete(e.fired, id)
	if wasFired {
		e.saveState()
	}
	e.mu.Unlock()
}

// Run evaluates every interval, for durations and time windows, until the
// context ends
func (e *Engine) Run(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	e.Evaluate()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			e.Evaluate()
		}
	}
}
