# Makefile for CCU3 MUI Go Server

BINARY_NAME=ccu-addon-mui-server
VERSION?=0.0.1

# Go parameters
GOCMD=go
GOBUILD=$(GOCMD) build
GOCLEAN=$(GOCMD) clean
GOTEST=$(GOCMD) test
GOGET=$(GOCMD) get
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

## Build all add-on binaries: ARMv7 (CCU3, 32-bit OpenCCU), arm64 and amd64
## (64-bit OpenCCU on Raspberry Pi 4/5, OVA, Docker, LXC). update_script
## installs the one matching uname -m.
build-addon: build-ccu3
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 $(GOBUILD) $(BUILD_FLAGS) -o $(BINARY_NAME)-arm64 -v
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 $(GOBUILD) $(BUILD_FLAGS) -o $(BINARY_NAME)-amd64 -v

## Run tests
test:
	$(GOTEST) -v ./...

## Build all add-on binaries: ARMv7 (CCU3, 32-bit OpenCCU), arm64 and amd64
## (64-bit OpenCCU on Raspberry Pi 4/5, OVA, Docker, LXC). update_script
## installs the one matching uname -m.
build-addon: build-ccu3
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 $(GOBUILD) $(BUILD_FLAGS) -o $(BINARY_NAME)-arm64 -v
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
	rm -f $(BINARY_NAME)-arm $(BINARY_NAME)-arm64 $(BINARY_NAME)-amd64

## Download dependencies
deps:
	$(GOMOD) download
	$(GOMOD) tidy

## Run locally
run:
	$(GOCMD) run main.go

## Show binary size comparison
size: build build-ccu3
	@echo "Binary sizes:"
	@ls -lh $(BINARY_NAME) $(BINARY_NAME)-arm | awk '{print $$9, $$5}'

## Install the binaries to the addon_installer directory
install-addon: build-addon
	mkdir -p ../addon_installer/go-server
	cp $(BINARY_NAME)-arm $(BINARY_NAME)-arm64 $(BINARY_NAME)-amd64 ../addon_installer/go-server/

.PHONY: all build build-ccu3 build-addon test coverage clean deps run size install-addon
