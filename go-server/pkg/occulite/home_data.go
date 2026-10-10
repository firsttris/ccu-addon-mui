package occulite

import (
	"slices"
	"strconv"

	"ccu-addon-mui-server/pkg/home"
	"ccu-addon-mui-server/pkg/tiles"
)

// The home model of openccu-lite (home.go): the add-on's own data

// SetTiles gives the home model the tile layouts, which follow their rooms
// and functions when openccu-lite moves them (FollowMeta)
func (h *Home) SetTiles(store *tiles.Store) {
	h.tiles = store
}

func (h *Home) SetChannelMode(iface, address string, mode int) (string, error) {
	err := h.store.change(func(data *ownData) error {
		data.Modes[Ref(iface, address)] = mode
		return nil
	})
	return home.SetOK, err
}

// GetFavorites returns the favorite lists the user sees (lists without
// users are everyone's)
func (h *Home) GetFavorites(username string) ([]home.Favorite, error) {
	list := []home.Favorite{}
	h.store.read(func(data *ownData) {
		for _, f := range data.Favorites {
			if len(f.Users) > 0 && !slices.Contains(f.Users, username) {
				continue
			}
			favorite := home.Favorite{ID: f.ID, Name: f.Name, Items: []home.FavoriteItem{}}
			for _, item := range f.Items {
				favorite.Items = append(favorite.Items, home.FavoriteItem{ID: item, Type: "CHANNEL"})
			}
			list = append(list, favorite)
		}
	})
	return list, nil
}

// ChangeFavorite creates, renames or deletes a list, or adds or removes a
// channel (openccu-lite has no system variables or programs to add)
func (h *Home) ChangeFavorite(change home.FavoriteChange) (string, string, error) {
	result, value := home.SetNotFound, ""
	err := h.store.change(func(data *ownData) error {
		if change.Action == home.FavoriteCreate {
			id := data.NextID
			data.NextID++
			list := favoriteList{ID: id, Name: change.Name, Items: []int64{}}
			if change.Username != "" {
				list.Users = []string{change.Username}
			}
			data.Favorites = append(data.Favorites, list)
			result, value = home.SetOK, strconv.FormatInt(id, 10)
			return nil
		}
		for i := range data.Favorites {
			f := &data.Favorites[i]
			if f.ID != change.ListID {
				continue
			}
			result = home.SetOK
			switch change.Action {
			case home.FavoriteRename:
				value, f.Name = f.Name, change.Name
			case home.FavoriteDelete:
				value = f.Name
				data.Favorites = append(data.Favorites[:i], data.Favorites[i+1:]...)
			case home.FavoriteAdd:
				value = f.Name
				for _, item := range f.Items {
					if item == change.ItemID {
						return nil
					}
				}
				f.Items = append(f.Items, change.ItemID)
			case home.FavoriteRemove:
				value = f.Name
				items := f.Items[:0]
				for _, item := range f.Items {
					if item != change.ItemID {
						items = append(items, item)
					}
				}
				f.Items = items
			}
			return nil
		}
		return nil
	})
	return result, value, err
}
