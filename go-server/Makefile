# Makefile for CCU3 MUI Go Server

BINARY_NAME=ccu-addon-mui-server

# Go parameters
GOCMD=go
GOBUILD=$(GOCMD) build
GOCLEAN=$(GOCMD) clean
GOTEST=$(GOCMD) test
GOMOD=$(GOCMD) mod

# Build flags for static binary
BUILD_FLAGS=-ldflags="-s -w -extldflags=-static" -tags netgo -a

# Target: CCU3 (ARM v7)
GOOS_CCU=linux
GOARCH_CCU=arm
GOARM_CCU=7

all: test build

## Build for local development
build:
	$(GOBUILD) -o $(BINARY_NAME) -v

## Build for CCU3 (ARMv7, static binary)
build-ccu3:
	CGO_ENABLED=0 GOOS=$(GOOS_CCU) GOARCH=$(GOARCH_CCU) GOARM=$(GOARM_CCU) \
		$(GOBUILD) $(BUILD_FLAGS) -o $(BINARY_NAME)-arm -v

## Run tests
test:
	$(GOTEST) -v ./...

## Build both add-on binaries: ARMv7 for the CCU3 and every Raspberry Pi
## (64-bit ARM kernels run it too), amd64 for OpenCCU on x86 (OVA, Docker,
## LXC). Each goes into an archive of its own.
build-addon: build-ccu3
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 $(GOBUILD) $(BUILD_FLAGS) -o $(BINARY_NAME)-amd64 -v

## Run tests with coverage and generate reports
coverage:
	$(GOTEST) ./... -coverprofile=coverage.out
	$(GOCMD) tool cover -func=coverage.out
	$(GOCMD) tool cover -html=coverage.out -o coverage.html

## Clean build artifacts
clean:
	$(GOCLEAN)
	rm -f $(BINARY_NAME)
	rm -f $(BINARY_NAME)-arm $(BINARY_NAME)-amd64 $(BINARY_NAME)-lite-arm64 $(BINARY_NAME)-lite-amd64

## Download dependencies
deps:
	$(GOMOD) download
	$(GOMOD) tidy

## The server for openccu-lite (-tags lite): aarch64 for the Raspberry Pi
## images, amd64 for the OVA
build-lite:
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 $(GOBUILD) $(BUILD_FLAGS) -tags netgo,lite -o $(BINARY_NAME)-lite-arm64 -v
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 $(GOBUILD) $(BUILD_FLAGS) -tags netgo,lite -o $(BINARY_NAME)-lite-amd64 -v

## Run locally
run:
	$(GOCMD) run main.go

## Show binary size comparison
size: build build-ccu3
	@echo "Binary sizes:"
	@ls -lh $(BINARY_NAME) $(BINARY_NAME)-arm | awk '{print $$9, $$5}'

## Install the binaries to the addon_installer directory
install-addon: build-addon build-lite
	mkdir -p ../addon_installer/go-server
	cp $(BINARY_NAME)-arm $(BINARY_NAME)-amd64 $(BINARY_NAME)-lite-arm64 $(BINARY_NAME)-lite-amd64 ../addon_installer/go-server/

.PHONY: all build build-ccu3 build-addon build-lite test coverage clean deps run size install-addon
