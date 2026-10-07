package rega

import (
	"reflect"
	"testing"
)

func TestParseFavorites(t *testing.T) {
	output := "L\t1001\tAbends\n" +
		"I\t1234\tCHANNEL\n" +
		"I\t950\tSYSVAR\n" +
		"I\t1500\tPROGRAM\n" +
		"L\t1002\tLeer\n" +
		"L\tbroken\n"
	want := []Favorite{
		{ID: 1001, Name: "Abends", Items: []FavoriteItem{{ID: 1234, Type: "CHANNEL"}, {ID: 950, Type: "SYSVAR"}, {ID: 1500, Type: "PROGRAM"}}},
		{ID: 1002, Name: "Leer", Items: []FavoriteItem{}},
	}
	if got := parseFavorites(output); !reflect.DeepEqual(got, want) {
		t.Errorf("got %+v", got)
	}
}

func TestChangeFavoriteValidates(t *testing.T) {
	c := &Client{}
	for _, change := range []FavoriteChange{
		{Action: "drop", ListID: 1},
		{Action: FavoriteCreate, Name: `a"); system.Exec("x`},
		{Action: FavoriteRename, ListID: 1, Name: ""},
		{Action: FavoriteCreate, Name: "Abends", Username: "x\"y"},
	} {
		if _, _, err := c.ChangeFavorite(change); err == nil {
			t.Errorf("%+v: expected an error", change)
		}
	}
	if _, err := c.GetFavorites(`a"b`); err == nil {
		t.Error("GetFavorites: expected an error for a quote in the user name")
	}
}
