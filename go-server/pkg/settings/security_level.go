package settings

// The security levels of the WebUI's security wizard
// (DialogChooseSecuritySettings, /lib/libsecuritylevel.tcl): each sets the
// firewall and the authentication of the remote API together
const (
	SecurityLevelLow    = "LOW"
	SecurityLevelMedium = "MEDIUM"
	SecurityLevelHigh   = "HIGH"
	// Anything else, e.g. after a port was opened in the firewall
	SecurityLevelCustom = "CUSTOM"
)

// userAckInstallWizard marks the first setup as done
const userAckInstallWizard = "userAckInstallWizard"

// ValidSecurityLevel is a level CCU.setSecurityLevel takes
func ValidSecurityLevel(level string) bool {
	return level == SecurityLevelLow || level == SecurityLevelMedium || level == SecurityLevelHigh
}

// SecurityLevel is SEC_getsecuritylevel: the level that the firewall and
// the authentication flag make
func (s *Service) SecurityLevel() (string, error) {
	fw, err := s.Firewall()
	if err == ErrNoFirewall {
		return SecurityLevelCustom, nil
	}
	if err != nil {
		return "", err
	}
	access := map[string]string{}
	for _, service := range fw.Services {
		access[service.ID] = service.Access
	}
	all := func(level string) bool {
		return access["XMLRPC"] == level && access["REGA"] == level && access["NEOSERVER"] == level
	}
	auth := s.Flag(AuthEnabled)
	setupDone := s.Flag(userAckInstallWizard)
	if (auth || !setupDone) && fw.Mode == "RESTRICTIVE" {
		switch {
		case all("none"):
			return SecurityLevelHigh, nil
		case all("restricted"):
			return SecurityLevelMedium, nil
		}
		return SecurityLevelCustom, nil
	}
	if fw.Mode == "MOST_OPEN" && access["XMLRPC"] == "full" && access["REGA"] == "restricted" && access["NEOSERVER"] == "full" {
		return SecurityLevelLow, nil
	}
	return SecurityLevelCustom, nil
}
