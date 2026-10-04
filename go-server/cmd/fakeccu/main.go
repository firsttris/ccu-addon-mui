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
	groupsFile := flag.String("groups-file", "", "heating groups of the fake HMServer (groups.gson)")
	configDir := flag.String("config-dir", "", "fake /etc/config for the security settings")
	flag.Parse()

	fixture, err := fakeccu.LoadFixture(*fixturePath)
	if err != nil {
		log.Fatal(err)
	}
	ccu := fakeccu.New(fixture)
	ccu.GroupsFile = *groupsFile
	ccu.ConfigDir = *configDir
	if err := ccu.Start(*host, *regaPort, *webUIPort, *bidcosPort, *hmipPort, *virtualPort); err != nil {
		log.Fatal(err)
	}
	defer ccu.Close()

	fmt.Printf("Fake CCU running. Start the server with:\n\n")
	fmt.Printf("  CCU_HOST=%s REGA_PORT=%d RPC_PORT=%d HMIP_PORT=%d VIRTUAL_DEVICES_PORT=%d CCU_WEBUI_URL=http://%s:%d\n\n",
		*host, ccu.RegaPort, ccu.InterfacePorts["BidCos-RF"], ccu.InterfacePorts["HmIP-RF"], ccu.InterfacePorts["VirtualDevices"], *host, ccu.WebUIPort)

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	<-sig
}
