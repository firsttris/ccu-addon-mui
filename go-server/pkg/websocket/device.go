package websocket

import "strings"

// deviceLabel turns a User-Agent into a short description for the list of
// logged-in devices, e.g. "iPad · Safari".
func deviceLabel(userAgent string) string {
	system := ""
	for _, s := range []struct{ match, name string }{
		{"iPad", "iPad"}, {"iPhone", "iPhone"}, {"Android", "Android"}, {"Windows", "Windows"},
		{"Macintosh", "Mac"}, {"CrOS", "ChromeOS"}, {"Linux", "Linux"},
	} {
		if strings.Contains(userAgent, s.match) {
			system = s.name
			break
		}
	}
	browser := ""
	for _, b := range []struct{ match, name string }{
		{"Edg/", "Edge"}, {"Firefox/", "Firefox"}, {"Chrome/", "Chrome"}, {"Safari/", "Safari"},
	} {
		if strings.Contains(userAgent, b.match) {
			browser = b.name
			break
		}
	}
	switch {
	case system != "" && browser != "":
		return system + " · " + browser
	case system != "" || browser != "":
		return system + browser
	case userAgent != "":
		if len(userAgent) > 40 {
			return userAgent[:40]
		}
		return userAgent
	}
	return "?"
}
