package rega

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

// SetExists: another user already has the name
const SetExists = "EXISTS"

// User is a CCU user as the WebUI's user administration lists it.
type User struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	// 1 guest, 2 user, 8 admin
	Level       int    `json:"-"`
	HasPassword bool   `json:"hasPassword"`
	ShowLogin   bool   `json:"showLogin"`
	Deletable   bool   `json:"deletable"`
	Mail        string `json:"mail"`
	Phone       string `json:"phone"`
}

// GetUsers lists the CCU users (get_users.tcl).
func (c *Client) GetUsers() ([]User, error) {
	output, err := c.Execute(getUsersScript)
	if err != nil {
		return nil, err
	}
	return parseUsers(output), nil
}

func parseUsers(output string) []User {
	users := []User{}
	for _, line := range strings.Split(output, "\n") {
		fields := strings.Split(strings.TrimRight(line, "\r"), "\t")
		if len(fields) < 11 || fields[0] != "U" {
			continue
		}
		id, err := strconv.ParseInt(fields[1], 10, 64)
		if err != nil {
			continue
		}
		level, _ := strconv.Atoi(fields[5])
		users = append(users, User{
			ID: id, Name: fields[2], FirstName: fields[3], LastName: fields[4], Level: level,
			HasPassword: fields[6] == "true", ShowLogin: fields[7] == "true", Deletable: fields[8] == "true",
			Mail: fields[9], Phone: strings.Join(fields[10:], "\t"),
		})
	}
	return users
}

// UserInput is what the user dialog sends: the full name, from which the
// login name and first and last name follow, as in the WebUI's
// userAccountConfigAdmin.htm (buildUserName, buildFirstLastName).
type UserInput struct {
	ID        int64
	FullName  string
	Level     int
	ShowLogin bool
	Mail      string
	Phone     string
	// nil keeps the password of an existing user
	Password *string
}

// The WebUI's isPasswordAllowed (webui.js), without the umlauts, which
// would not survive the way to ReGa unchanged
var passwordRegex = regexp.MustCompile(`^[a-zA-Z0-9.=!$():;#*-]*$`)

// validateUserText: the WebUI's isTextAllowed (webui.js), plus ^, which
// would end the ReGa string, and control characters
func validateUserText(text string, max int) error {
	if len(text) > max || strings.ContainsAny(text, "<>'\"&$[]{}\\^") || strings.IndexFunc(text, unicode.IsControl) >= 0 {
		return fmt.Errorf("invalid text")
	}
	return nil
}

// UserNames splits a full name as the WebUI does: the login name without
// spaces; the first name up to the first space, the rest the last name.
func UserNames(fullName string) (name, first, last string) {
	fullName = strings.TrimSpace(fullName)
	name = strings.Join(strings.Fields(fullName), "")
	first, last, _ = strings.Cut(fullName, " ")
	return name, first, last
}

// SaveUser creates (ID 0) or changes a user; SetOK with its id, SetExists
// or SetNotFound.
func (c *Client) SaveUser(input UserInput) (result string, id int64, err error) {
	name, first, last := UserNames(input.FullName)
	if name == "" || validateUserText(input.FullName, 100) != nil {
		return "", 0, fmt.Errorf("invalid name")
	}
	if validateUserText(input.Mail, 100) != nil || validateUserText(input.Phone, 50) != nil {
		return "", 0, fmt.Errorf("invalid mail or phone")
	}
	if input.Level != 1 && input.Level != 2 && input.Level != 8 {
		return "", 0, fmt.Errorf("invalid level")
	}
	if input.ID < 0 {
		return "", 0, fmt.Errorf("invalid id")
	}
	password, setPassword := "", input.Password != nil || input.ID == 0
	if input.Password != nil {
		password = *input.Password
	}
	if len(password) > 100 || !passwordRegex.MatchString(password) {
		return "", 0, fmt.Errorf("invalid password")
	}
	script := strings.NewReplacer(
		"{{ID}}", strconv.FormatInt(input.ID, 10),
		"{{NAME}}", name,
		"{{FIRST_NAME}}", first,
		"{{LAST_NAME}}", last,
		"{{LEVEL}}", strconv.Itoa(input.Level),
		"{{SHOW_LOGIN}}", strconv.FormatBool(input.ShowLogin),
		"{{MAIL}}", input.Mail,
		"{{PHONE}}", input.Phone,
		"{{SET_PASSWORD}}", strconv.FormatBool(setPassword),
		"{{PASSWORD}}", password,
	).Replace(saveUserScript)
	output, err := c.Execute(script)
	if err != nil {
		return "", 0, err
	}
	if strings.TrimSpace(output) == SetExists {
		return SetExists, 0, nil
	}
	result, value, err := resultWithValue(output)
	if err != nil || result != SetOK {
		return result, 0, err
	}
	id, err = strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	return result, id, err
}

// DeleteUser deletes a user (not the Admin); SetOK with the name, or
// SetNotFound.
func (c *Client) DeleteUser(id int64) (result, name string, err error) {
	output, err := c.Execute(strings.ReplaceAll(deleteUserScript, "{{ID}}", strconv.FormatInt(id, 10)))
	if err != nil {
		return "", "", err
	}
	return resultWithValue(output)
}
