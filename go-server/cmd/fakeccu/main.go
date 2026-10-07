// Command fakeccu runs a fake CCU from a fixture, for running the add-on
// (and the Playwright tests) without hardware:
//
//	go run ./cmd/fakeccu -fixture ../fixtures/demo-ccu.json
//
// Then start the server with the printed environment.
package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"ccu-addon-mui-server/pkg/fakeccu"
)

func main() {
	fixturePath := flag.String("fixture", "../fixtures/demo-ccu.json", "fixture JSON file")
	host := flag.String("host", "127.0.0.1", "address to listen on")
	regaPort := flag.Int("rega-port", 18181, "ReGa port")
	webUIPort := flag.Int("webui-port", 18080, "WebUI (login) port")
	bidcosPort := flag.Int("bidcos-port", 12001, "BidCos-RF XML-RPC port")
	hmipPort := flag.Int("hmip-port", 12010, "HmIP-RF XML-RPC port")
	virtualPort := flag.Int("virtual-port", 19292, "VirtualDevices XML-RPC port")
	wiredPort := flag.Int("wired-port", 12000, "BidCos-Wired XML-RPC port")
	groupsFile := flag.String("groups-file", "", "heating groups of the fake HMServer (groups.gson)")
	configDir := flag.String("config-dir", "", "fake /etc/config for the security settings")
	lite := flag.Bool("lite", false, "an openccu-lite: no ReGa, occulited's APIs on the WebUI port")
	tokenFile := flag.String("token-file", filepath.Join(os.TempDir(), "mui-fake-addon-token"), "with -lite: where to write the add-on's token")
	flag.Parse()

	fixture, err := fakeccu.LoadFixture(*fixturePath)
	if err != nil {
		log.Fatal(err)
	}
	ccu := fakeccu.New(fixture)
	ccu.GroupsFile = *groupsFile
	ccu.ConfigDir = *configDir
	ccu.Lite = *lite
	if err := ccu.Start(*host, *regaPort, *webUIPort, *bidcosPort, *hmipPort, *virtualPort, *wiredPort); err != nil {
		log.Fatal(err)
	}
	defer ccu.Close()

	if *lite {
		if err := os.WriteFile(*tokenFile, []byte(fakeccu.LiteAddonToken+"\n"), 0o600); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("Fake openccu-lite running. Build and start the server with -tags lite and:\n\n")
		fmt.Printf("  LITE_FORCE=1 OCCULITE_URL=http://%s:%d OCCULITE_TOKEN_FILE=%s CCU_HOST=%s RPC_PORT=%d HMIP_PORT=%d VIRTUAL_DEVICES_PORT=%d WIRED_PORT=%d\n\n",
			*host, ccu.WebUIPort, *tokenFile, *host, ccu.InterfacePorts["BidCos-RF"], ccu.InterfacePorts["HmIP-RF"], ccu.InterfacePorts["VirtualDevices"], ccu.InterfacePorts["BidCos-Wired"])
		fmt.Printf("The session gate is the proxy's: send X-Occulite-Session %s (Admin) or %s (Gast).\n\n", fakeccu.LiteSession("Admin"), fakeccu.LiteSession("Gast"))
	} else {
		fmt.Printf("Fake CCU running. Start the server with:\n\n")
		fmt.Printf("  CCU_HOST=%s REGA_PORT=%d RPC_PORT=%d HMIP_PORT=%d VIRTUAL_DEVICES_PORT=%d WIRED_PORT=%d CCU_WEBUI_URL=http://%s:%d\n\n",
			*host, ccu.RegaPort, ccu.InterfacePorts["BidCos-RF"], ccu.InterfacePorts["HmIP-RF"], ccu.InterfacePorts["VirtualDevices"], ccu.InterfacePorts["BidCos-Wired"], *host, ccu.WebUIPort)
	}

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	<-sig
}
