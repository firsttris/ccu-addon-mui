package rega

import (
	"ccu-addon-mui-server/pkg/home"
	"fmt"
	"strconv"
	"strings"
)

type Favorite = home.Favorite

type FavoriteItem = home.FavoriteItem

// Changes to favorite lists, see favorite_change.tcl
const (
	FavoriteCreate = home.FavoriteCreate
	FavoriteRename = home.FavoriteRename
	FavoriteDelete = home.FavoriteDelete
	FavoriteAdd    = home.FavoriteAdd
	FavoriteRemove = home.FavoriteRemove
)

func parseFavorites(output string) []Favorite {
	isRecord := func(line string) bool { return strings.HasPrefix(line, "L\t") || strings.HasPrefix(line, "I\t") }
	favorites := []Favorite{}
	for _, fields := range splitRecords(output, isRecord) {
		if len(fields) < 3 {
			continue
		}
		id, err := strconv.ParseInt(fields[1], 10, 64)
		if err != nil {
			continue
		}
		switch fields[0] {
		case "L":
			favorites = append(favorites, Favorite{ID: id, Name: rejoin(fields, 2), Items: []FavoriteItem{}})
		case "I":
			if n := len(favorites); n > 0 {
				favorites[n-1].Items = append(favorites[n-1].Items, FavoriteItem{ID: id, Type: fields[2]})
			}
		}
	}
	return favorites
}

// validateUsername guards a user name substituted into a string literal;
// empty stands for no user (all lists).
func validateUsername(username string) error {
	if strings.ContainsAny(username, "\"\\\r\n") {
		return fmt.Errorf("invalid username")
	}
	return nil
}

// GetFavorites returns the favorite lists the CCU user sees, or all lists
// if username is empty (no login required).
func (c *Client) GetFavorites(username string) ([]Favorite, error) {
	if err := validateUsername(username); err != nil {
		return nil, err
	}
	output, err := c.Execute(strings.ReplaceAll(getFavoritesScript, "{{USERNAME}}", username))
	if err != nil {
		return nil, err
	}
	return parseFavorites(output), nil
}

type FavoriteChange = home.FavoriteChange

// ChangeFavorite applies a change and returns SetOK with the new list's id
// (create) or the list's previous name, or SetNotFound.
func (c *Client) ChangeFavorite(change FavoriteChange) (result, value string, err error) {
	switch change.Action {
	case FavoriteCreate, FavoriteRename:
		if err := validateName(change.Name); err != nil {
			return "", "", err
		}
	case FavoriteDelete, FavoriteAdd, FavoriteRemove:
		change.Name = ""
	default:
		return "", "", fmt.Errorf("invalid action")
	}
	if err := validateUsername(change.Username); err != nil {
		return "", "", err
	}
	// In one pass: a name containing "{{LIST_ID}}" stays as it is
	script := strings.NewReplacer(
		"{{ACTION}}", change.Action,
		"{{USERNAME}}", change.Username,
		"{{NAME}}", change.Name,
		"{{LIST_ID}}", strconv.FormatInt(change.ListID, 10),
		"{{ITEM_ID}}", strconv.FormatInt(change.ItemID, 10),
	).Replace(favoriteChangeScript)
	output, err := c.Execute(script)
	if err != nil {
		return "", "", err
	}
	return resultWithValue(output)
}
