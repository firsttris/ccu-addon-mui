package rega

import "ccu-addon-mui-server/pkg/home"

// The ReGa is the CCU's home model
var _ home.Source = (*Client)(nil)
