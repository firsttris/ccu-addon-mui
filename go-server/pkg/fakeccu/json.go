package fakeccu

import (
	"encoding/json"
	"io"
)

func jsonDecode(r io.Reader, v any) error {
	return json.NewDecoder(r).Decode(v)
}
