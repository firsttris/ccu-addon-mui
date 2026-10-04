package rega

import "testing"

func TestParseUsers(t *testing.T) {
	users := parseUsers("U\t1001\tAdmin\tAdmin\t\t8\ttrue\ttrue\tfalse\t\t\nU\t1002\tGast\tGast\t\t1\tfalse\tfalse\ttrue\tg@x.de\t0123\njunk\n")
	if len(users) != 2 || users[0].Name != "Admin" || users[0].Level != 8 || users[0].Deletable || !users[0].HasPassword {
		t.Fatalf("got %+v", users)
	}
	if users[1].Mail != "g@x.de" || users[1].Phone != "0123" || !users[1].Deletable || users[1].ShowLogin {
		t.Fatalf("got %+v", users[1])
	}
	if users[0].AutoLogin || users[1].AutoLogin {
		t.Fatalf("no user is logged in automatically: %+v", users)
	}
	// A: the user logged in automatically (UsersDefaultLogin)
	users = parseUsers("U\t1001\tAdmin\tAdmin\t\t8\ttrue\ttrue\tfalse\t\t\nU\t1002\tGast\tGast\t\t1\tfalse\tfalse\ttrue\t\t\nA\t1002\n")
	if users[0].AutoLogin || !users[1].AutoLogin {
		t.Fatalf("got %+v", users)
	}
}

func TestUserNames(t *testing.T) {
	name, first, last := UserNames("  Anna Maria Muster ")
	if name != "AnnaMariaMuster" || first != "Anna" || last != "Maria Muster" {
		t.Fatalf("got %q %q %q", name, first, last)
	}
	name, first, last = UserNames("Kinder")
	if name != "Kinder" || first != "Kinder" || last != "" {
		t.Fatalf("got %q %q %q", name, first, last)
	}
}

func TestSaveUserRefusesUnsafeInput(t *testing.T) {
	c := &Client{}
	bad := "x^; system.Exec(^rm"
	for _, input := range []UserInput{
		{FullName: "", Level: 2},
		{FullName: bad, Level: 2},
		{FullName: "Ok", Level: 3},
		{FullName: "Ok", Level: 2, Password: &bad},
		{FullName: "Ok", Level: 2, Mail: "a\nb"},
	} {
		if _, _, err := c.SaveUser(input); err == nil {
			t.Errorf("expected an error for %+v", input)
		}
	}
}
