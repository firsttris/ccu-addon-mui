// Package devimages reads the device pictures of the WebUI: which picture
// a device type has and where its channels sit in it.
//
// The WebUI ships line drawings of the devices (www/config/img/devices/50
// and /250) and lists them in www/config/devdescr/DEVDB.tcl: DEV_PATHS
// names the pictures of each type, DEV_HIGHLIGHT the shapes that mark a
// channel (webui.js DrawForm: circle, rectangle, ellipse, sets of them).
package devimages

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Shape marks a channel in the picture, in fractions of its size
type Shape struct {
	// circle, rect or ellipse
	Kind string  `json:"kind"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	// Width and height; a circle's diameter in both
	W float64 `json:"w"`
	H float64 `json:"h"`
}

// Image is the picture of a device type with its channel marks
type Image struct {
	// Path below www/config/img/devices, e.g. "250/131_hmip-wrc6.png"
	Path string `json:"path"`
	// Shapes per channel (the WebUI's form names: "1", "1+2", ...)
	Channels map[string][]Shape `json:"channels,omitempty"`
}

// ImagePrefix is where DEVDB.tcl's paths point to
const ImagePrefix = "/config/img/devices/"

// Load reads DEVDB.tcl below the WebUI's www directory. Types are keyed in
// lower case, as the CCU writes some types in both spellings.
func Load(wwwDir string) (map[string]Image, error) {
	data, err := os.ReadFile(filepath.Join(wwwDir, "config", "devdescr", "DEVDB.tcl"))
	if err != nil {
		return nil, err
	}
	return Parse(string(data))
}

// Parse reads the DEV_PATHS and DEV_HIGHLIGHT arrays of DEVDB.tcl
func Parse(script string) (map[string]Image, error) {
	paths, err := arrayOf(script, "DEV_PATHS")
	if err != nil {
		return nil, err
	}
	highlights, _ := arrayOf(script, "DEV_HIGHLIGHT")
	images := map[string]Image{}
	for devType, sizes := range paths {
		var path string
		for _, entry := range list(sizes) {
			pair := list(entry)
			if len(pair) == 2 && pair[0] == "250" && strings.HasPrefix(pair[1], ImagePrefix) {
				path = strings.TrimPrefix(pair[1], ImagePrefix)
			}
		}
		if path == "" {
			continue
		}
		image := Image{Path: path}
		if forms := highlights[devType]; forms != "" {
			image.Channels = channelShapes(forms)
		}
		images[strings.ToLower(devType)] = image
	}
	return images, nil
}

// arrayOf returns the key/value pairs of "array set NAME {...}"
func arrayOf(script, name string) (map[string]string, error) {
	start := strings.Index(script, "array set "+name)
	if start < 0 {
		return nil, fmt.Errorf("DEVDB.tcl: %s missing", name)
	}
	open := strings.IndexByte(script[start:], '{')
	if open < 0 {
		return nil, fmt.Errorf("DEVDB.tcl: %s empty", name)
	}
	body, _, ok := braced(script, start+open)
	if !ok {
		return nil, fmt.Errorf("DEVDB.tcl: %s unterminated", name)
	}
	items := list(body)
	result := map[string]string{}
	for i := 0; i+1 < len(items); i += 2 {
		result[items[i]] = items[i+1]
	}
	return result, nil
}

// braced returns the text inside the braces starting at s[i]
func braced(s string, i int) (string, int, bool) {
	depth := 0
	for j := i; j < len(s); j++ {
		switch s[j] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return s[i+1 : j], j + 1, true
			}
		}
	}
	return "", len(s), false
}

// list splits a Tcl list into its words: {braced}, "quoted" or bare
func list(s string) []string {
	var words []string
	for i := 0; i < len(s); {
		switch c := s[i]; {
		case c == ' ' || c == '\t' || c == '\n' || c == '\r':
			i++
		case c == '{':
			word, next, ok := braced(s, i)
			if !ok {
				return words
			}
			words = append(words, word)
			i = next
		case c == '"':
			end := strings.IndexByte(s[i+1:], '"')
			if end < 0 {
				return words
			}
			words = append(words, s[i+1:i+1+end])
			i += end + 2
		default:
			end := strings.IndexAny(s[i:], " \t\n\r")
			if end < 0 {
				end = len(s) - i
			}
			words = append(words, s[i:i+end])
			i += end
		}
	}
	return words
}

// Form types of webui.js (GD_TYPE)
const (
	gdCircle    = 1
	gdRectangle = 2
	gdEllipse   = 4
	gdFormset   = 5
)

// channelShapes resolves the forms of a type, sets into their shapes
func channelShapes(forms string) map[string][]Shape {
	raw := map[string][]string{}
	var names []string
	for _, form := range list(forms) {
		words := list(form)
		if len(words) < 2 {
			continue
		}
		raw[words[0]] = words[1:]
		names = append(names, words[0])
	}
	var resolve func(name string, depth int) []Shape
	resolve = func(name string, depth int) []Shape {
		words, ok := raw[name]
		if !ok || depth > 5 {
			return nil
		}
		kind, _ := strconv.Atoi(words[0])
		nums := make([]float64, 0, len(words)-1)
		for _, w := range words[1:] {
			if f, err := strconv.ParseFloat(w, 64); err == nil {
				nums = append(nums, f)
			}
		}
		switch {
		case kind == gdCircle && len(nums) >= 3:
			// x, y is the top left of the circle's box (fillArc)
			return []Shape{{Kind: "circle", X: nums[0], Y: nums[1], W: 2 * nums[2], H: 2 * nums[2]}}
		case kind == gdRectangle && len(nums) >= 4:
			return []Shape{{Kind: "rect", X: nums[0], Y: nums[1], W: nums[2], H: nums[3]}}
		case kind == gdEllipse && len(nums) >= 4:
			return []Shape{{Kind: "ellipse", X: nums[0], Y: nums[1], W: nums[2], H: nums[3]}}
		case kind == gdFormset:
			var shapes []Shape
			for _, ref := range words[1:] {
				shapes = append(shapes, resolve(strings.Trim(ref, "'\""), depth+1)...)
			}
			return shapes
		}
		return nil
	}
	result := map[string][]Shape{}
	for _, name := range names {
		if shapes := resolve(name, 0); len(shapes) > 0 {
			result[name] = shapes
		}
	}
	if len(result) == 0 {
		return nil
	}
	return result
}
