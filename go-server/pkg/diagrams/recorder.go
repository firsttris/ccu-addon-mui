package diagrams

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Point is the values of a series in one interval: their average, minimum
// and maximum and how many there were. T is the interval's start (Unix
// seconds).
type Point struct {
	T   int64
	Avg float64
	Min float64
	Max float64
	N   int
}

// Recorder keeps the values of the wanted series: per minute for
// MinuteRetention (dir/minute, left out of CCU backups by .nobackup, see
// the WebUI's backup.tcl --exclude-tag) and per hour for good (dir/hour).
// Values are collected in memory and appended to the files every few
// minutes, so the flash memory is not written on every event.
type Recorder struct {
	dir string
	now func() time.Time

	mu      sync.Mutex
	wanted  map[string]bool
	current [2]map[string]*Point
	pending [2]map[string][]Point
}

const (
	minuteRes = iota
	hourRes
)

var resolutions = [2]struct {
	name   string
	period int64
}{{"minute", 60}, {"hour", 3600}}

// MinuteRetention is how long the per-minute values are kept
const MinuteRetention = 60 * 24 * time.Hour

// Ranges up to this long are shown from the per-minute values
const minuteRange = 8 * 24 * time.Hour

// NewRecorder records into dir
func NewRecorder(dir string) *Recorder {
	r := &Recorder{dir: dir, now: time.Now, wanted: map[string]bool{}}
	for i := range r.current {
		r.current[i] = map[string]*Point{}
		r.pending[i] = map[string][]Point{}
	}
	return r
}

// SetWanted sets the keys of the series to record
func (r *Recorder) SetWanted(keys map[string]bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.wanted = keys
}

// Record adds a value of a series; values that are no number or boolean
// are ignored
func (r *Recorder) Record(key string, value interface{}, at time.Time) {
	v, ok := ToFloat(value)
	if !ok {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if !r.wanted[key] {
		return
	}
	for res := range resolutions {
		start := at.Unix() - mod(at.Unix(), resolutions[res].period)
		p := r.current[res][key]
		if p != nil && p.T != start {
			r.pending[res][key] = append(r.pending[res][key], *p)
			p = nil
		}
		if p == nil {
			p = &Point{T: start, Min: v, Max: v}
			r.current[res][key] = p
		}
		p.add(v, 1)
	}
}

func (p *Point) add(v float64, n int) {
	p.Avg = (p.Avg*float64(p.N) + v*float64(n)) / float64(p.N+n)
	p.N += n
	p.Min = math.Min(p.Min, v)
	p.Max = math.Max(p.Max, v)
}

// merge combines two points of the same interval
func (p *Point) merge(o Point) {
	p.Avg = (p.Avg*float64(p.N) + o.Avg*float64(o.N)) / float64(p.N+o.N)
	p.N += o.N
	p.Min = math.Min(p.Min, o.Min)
	p.Max = math.Max(p.Max, o.Max)
}

func mod(a, b int64) int64 {
	return ((a % b) + b) % b
}

// ToFloat converts a datapoint value; booleans are 0 and 1
func ToFloat(value interface{}) (float64, bool) {
	switch v := value.(type) {
	case float64:
		return v, !math.IsNaN(v) && !math.IsInf(v, 0)
	case float32:
		return float64(v), true
	case int:
		return float64(v), true
	case int32:
		return float64(v), true
	case int64:
		return float64(v), true
	case bool:
		if v {
			return 1, true
		}
		return 0, true
	case string:
		switch strings.TrimSpace(v) {
		case "true":
			return 1, true
		case "false":
			return 0, true
		}
		f, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
		return f, err == nil && !math.IsNaN(f) && !math.IsInf(f, 0)
	}
	return 0, false
}

func safeKey(key string) string {
	return strings.NewReplacer(":", "_", "/", "_").Replace(key)
}

// file is where a point of a resolution is kept: a file per day for
// minutes, per year for hours (UTC)
func (r *Recorder) file(res int, key string, t int64) string {
	ts := time.Unix(t, 0).UTC()
	name := ts.Format("2006-01-02")
	if res == hourRes {
		name = ts.Format("2006")
	}
	return filepath.Join(r.dir, resolutions[res].name, safeKey(key), name+".csv")
}

// Flush writes the finished intervals; with all also the current ones
// (on shutdown: a later value in the same interval is merged when read)
func (r *Recorder) Flush(all bool) error {
	r.mu.Lock()
	now := r.now().Unix()
	writes := map[string][]Point{}
	for res := range resolutions {
		for key, p := range r.current[res] {
			if all || now >= p.T+resolutions[res].period {
				r.pending[res][key] = append(r.pending[res][key], *p)
				delete(r.current[res], key)
			}
		}
		for key, points := range r.pending[res] {
			for _, p := range points {
				f := r.file(res, key, p.T)
				writes[f] = append(writes[f], p)
			}
		}
		r.pending[res] = map[string][]Point{}
	}
	r.mu.Unlock()
	return r.write(writes)
}

func (r *Recorder) write(writes map[string][]Point) error {
	var errs []error
	if len(writes) > 0 {
		// Keeps the per-minute values out of the CCU backup
		minuteDir := filepath.Join(r.dir, resolutions[minuteRes].name)
		if err := os.MkdirAll(minuteDir, 0o755); err == nil {
			tag := filepath.Join(minuteDir, ".nobackup")
			if _, err := os.Stat(tag); errors.Is(err, os.ErrNotExist) {
				_ = os.WriteFile(tag, nil, 0o644)
			}
		}
	}
	for file, points := range writes {
		if err := appendPoints(file, points); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func appendPoints(file string, points []Point) error {
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		return err
	}
	f, err := os.OpenFile(file, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	w := bufio.NewWriter(f)
	for _, p := range points {
		fmt.Fprintf(w, "%d,%s,%s,%s,%d\n", p.T, formatFloat(p.Avg), formatFloat(p.Min), formatFloat(p.Max), p.N)
	}
	if err := w.Flush(); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

func formatFloat(v float64) string {
	// Exact: counters reach hundreds of millions of Wh
	return strconv.FormatFloat(v, 'g', -1, 64)
}

func readPoints(file string, from, to int64, into []Point) []Point {
	f, err := os.Open(file)
	if err != nil {
		return into
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		fields := strings.Split(scanner.Text(), ",")
		if len(fields) != 5 {
			continue
		}
		t, err1 := strconv.ParseInt(fields[0], 10, 64)
		avg, err2 := strconv.ParseFloat(fields[1], 64)
		lo, err3 := strconv.ParseFloat(fields[2], 64)
		hi, err4 := strconv.ParseFloat(fields[3], 64)
		n, err5 := strconv.Atoi(fields[4])
		if err1 != nil || err2 != nil || err3 != nil || err4 != nil || err5 != nil || n < 1 || t < from || t >= to {
			continue
		}
		into = append(into, Point{T: t, Avg: avg, Min: lo, Max: hi, N: n})
	}
	return into
}

// Query returns the values of a series from from to to (Unix seconds),
// combined into at most buckets points
func (r *Recorder) Query(key string, from, to int64, buckets int) []Point {
	res := hourRes
	if time.Duration(to-from)*time.Second <= minuteRange && r.now().Add(-MinuteRetention).Unix() <= from {
		res = minuteRes
	}
	var points []Point
	// The files of the days (minutes) or years (hours) in the range
	first := time.Unix(from, 0).UTC()
	if res == minuteRes {
		first = time.Date(first.Year(), first.Month(), first.Day(), 0, 0, 0, 0, time.UTC)
	} else {
		first = time.Date(first.Year(), 1, 1, 0, 0, 0, 0, time.UTC)
	}
	for t := first; t.Unix() < to; {
		points = readPoints(r.file(res, key, t.Unix()), from, to, points)
		if res == minuteRes {
			t = t.AddDate(0, 0, 1)
		} else {
			t = t.AddDate(1, 0, 0)
		}
	}
	// What is not written yet
	r.mu.Lock()
	for _, p := range r.pending[res][key] {
		if p.T >= from && p.T < to {
			points = append(points, p)
		}
	}
	if p := r.current[res][key]; p != nil && p.T >= from && p.T < to {
		points = append(points, *p)
	}
	r.mu.Unlock()
	return combine(points, from, to, buckets)
}

// combine sorts points, merges those of the same interval and, if there are
// more than buckets, those of the same bucket
func combine(points []Point, from, to int64, buckets int) []Point {
	sort.SliceStable(points, func(i, j int) bool { return points[i].T < points[j].T })
	merged := []Point{}
	for _, p := range points {
		if n := len(merged); n > 0 && merged[n-1].T == p.T {
			merged[n-1].merge(p)
			continue
		}
		merged = append(merged, p)
	}
	if buckets < 1 || len(merged) <= buckets {
		return merged
	}
	width := (to - from + int64(buckets) - 1) / int64(buckets)
	if width < 1 {
		width = 1
	}
	out := []Point{}
	for _, p := range merged {
		start := from + (p.T-from)/width*width
		if n := len(out); n > 0 && out[n-1].T == start {
			out[n-1].merge(p)
			continue
		}
		p.T = start
		out = append(out, p)
	}
	return out
}

// HasData reports whether anything was recorded for a series
func (r *Recorder) HasData(key string) bool {
	for res := range resolutions {
		if entries, err := os.ReadDir(filepath.Join(r.dir, resolutions[res].name, safeKey(key))); err == nil && len(entries) > 0 {
			return true
		}
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	for res := range resolutions {
		if r.current[res][key] != nil || len(r.pending[res][key]) > 0 {
			return true
		}
	}
	return false
}

// Sample is a single value of a series at a time (Unix seconds)
type Sample struct {
	T int64
	V float64
}

// Import writes older values of a series, as from the system protocol,
// before its first recorded one
func (r *Recorder) Import(key string, samples []Sample) error {
	writes := map[string][]Point{}
	cutoff := r.now().Add(-MinuteRetention).Unix()
	for res := range resolutions {
		byStart := map[int64]*Point{}
		var starts []int64
		for _, s := range samples {
			if res == minuteRes && s.T < cutoff {
				continue
			}
			start := s.T - mod(s.T, resolutions[res].period)
			p := byStart[start]
			if p == nil {
				p = &Point{T: start, Min: s.V, Max: s.V}
				byStart[start] = p
				starts = append(starts, start)
			}
			p.add(s.V, 1)
		}
		sort.Slice(starts, func(i, j int) bool { return starts[i] < starts[j] })
		for _, start := range starts {
			f := r.file(res, key, start)
			writes[f] = append(writes[f], *byStart[start])
		}
	}
	return r.write(writes)
}

// Prune deletes the per-minute values older than MinuteRetention. The
// hourly values stay, also of series no longer wanted: a diagram made
// again shows their history.
func (r *Recorder) Prune() {
	cutoff := r.now().Add(-MinuteRetention).UTC().Format("2006-01-02")
	base := filepath.Join(r.dir, resolutions[minuteRes].name)
	dirs, err := os.ReadDir(base)
	if err != nil {
		return
	}
	for _, dir := range dirs {
		if !dir.IsDir() {
			continue
		}
		files, _ := os.ReadDir(filepath.Join(base, dir.Name()))
		for _, f := range files {
			if day := strings.TrimSuffix(f.Name(), ".csv"); day < cutoff {
				_ = os.Remove(filepath.Join(base, dir.Name(), f.Name()))
			}
		}
	}
}

// Run writes the values every interval and prunes once a day until ctx is
// done, then writes what is left
func (r *Recorder) Run(ctx context.Context, interval time.Duration, onError func(error)) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	r.Prune()
	lastPrune := r.now()
	for {
		select {
		case <-ctx.Done():
			if err := r.Flush(true); err != nil {
				onError(err)
			}
			return
		case <-ticker.C:
			if err := r.Flush(false); err != nil {
				onError(err)
			}
			if r.now().Sub(lastPrune) > 24*time.Hour {
				r.Prune()
				lastPrune = r.now()
			}
		}
	}
}
