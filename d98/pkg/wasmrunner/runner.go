package wasmrunner

import (
	"context"
	"errors"
	"fmt"
	"runtime"
	"sync"
	"time"

	"github.com/bytecodealliance/wasmtime-go/v18"
)

const (
	TimeoutMs     = 100
	MaxFuel       = 100000000
	MaxMemoryBytes  = 5 * 1024 * 1024
)

type ErrorType string

const (
	ErrorTypeTimeout      ErrorType = "timeout"
	ErrorTypeFuelExhausted ErrorType = "fuel_exhausted"
	ErrorTypeMemoryLimit ErrorType = "memory_limit"
	ErrorTypeTrap       ErrorType = "trap"
	ErrorTypeInvalidResult ErrorType = "invalid_result"
	ErrorTypeFunctionNotFound ErrorType = "function_not_found"
	ErrorTypeModuleLoad ErrorType = "module_load"
	ErrorTypeInstantiation ErrorType = "instantiation"
	ErrorTypeExecution    ErrorType = "execution"
	ErrorTypeInternal     ErrorType = "internal"
)

type WasmError struct {
	Type    ErrorType
	Message string
	Cause   error
}

func (e *WasmError) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("%s: %s (cause: %v)", e.Type, e.Message, e.Cause)
	}
	return fmt.Sprintf("%s: %s", e.Type, e.Message)
}

func (e *WasmError) Unwrap() error {
	return e.Cause
}

func NewWasmError(typ ErrorType, msg string, cause error) *WasmError {
	return &WasmError{
		Type:    typ,
		Message: msg,
		Cause:   cause,
	}
}

var (
	ErrTimeout = &WasmError{
		Type:    ErrorTypeTimeout,
		Message: "execution exceeded 100ms CPU time limit",
	}
	ErrFuelExhausted = &WasmError{
		Type:    ErrorTypeFuelExhausted,
		Message: "execution exceeded instruction limit",
	}
	ErrFunctionNotFound = &WasmError{
		Type:    ErrorTypeFunctionNotFound,
		Message: "function not found in module",
	}
	ErrMemoryLimit = &WasmError{
		Type:    ErrorTypeMemoryLimit,
		Message: "memory allocation exceeded 5MB limit",
	}
)

type ExecutionResult struct {
	Result   int64
	TimeMs   int64
	FuelUsed uint64
	MemUsed  uint64
	Success  bool
	Error    *WasmError
}

type Runner struct {
	engine *wasmtime.Engine
	pool   sync.Pool
}

func NewRunner() *Runner {
	engine := wasmtime.NewEngine()
	engine.SetEpochDeadlineCallback(1, func() bool { return true })

	return &Runner{
		engine: engine,
		pool: sync.Pool{
			New: func() interface{} {
				return wasmtime.NewStore(engine)
			},
		},
	}
}

func (r *Runner) Execute(wasmPath string, funcName string, input int64) ExecutionResult {
	startTime := time.Now()
	resultChan := make(chan ExecutionResult, 1)

	ctx, cancel := context.WithTimeout(context.Background(), TimeoutMs*time.Millisecond)
	defer cancel()

	go func() {
		resultChan <- r.executeWasm(wasmPath, funcName, input)
	}()

	select {
	case <-ctx.Done():
		return ExecutionResult{
			TimeMs:  time.Since(startTime).Milliseconds(),
			Success: false,
			Error:   ErrTimeout,
		}
	case result := <-resultChan:
		result.TimeMs = time.Since(startTime).Milliseconds()
		return result
	}
}

func (r *Runner) executeWasm(wasmPath string, funcName string, input int64) ExecutionResult {
	store := r.pool.Get().(*wasmtime.Store)
	defer r.pool.Put(store)

	store.SetFuel(MaxFuel)
	store.Limiter().MemorySize(MaxMemoryBytes)

	module, err := wasmtime.NewModuleFromFile(r.engine, wasmPath)
	if err != nil {
		return ExecutionResult{
			Success: false,
			Error: NewWasmError(
				ErrorTypeModuleLoad,
				"failed to load Wasm module",
				err,
			),
		}
	}

	linker := wasmtime.NewLinker(r.engine)
	instance, err := linker.Instantiate(store, module)
	if err != nil {
		var trap *wasmtime.Trap
		if errors.As(err, &trap) {
			return ExecutionResult{
				Success: false,
				Error: NewWasmError(
					ErrorTypeTrap,
					fmt.Sprintf("Wasm trap during instantiation: %s", trap.Message()),
					err,
				),
			}
		}
		return ExecutionResult{
			Success: false,
			Error: NewWasmError(
				ErrorTypeInstantiation,
				"failed to instantiate module",
				err,
			),
		}
	}

	fn := instance.GetFunc(store, funcName)
	if fn == nil {
		return ExecutionResult{
			Success: false,
			Error:   ErrFunctionNotFound,
		}
	}

	results, err := fn.Call(store, input)
	if err != nil {
		var trap *wasmtime.Trap
		if errors.As(err, &trap) {
			if trap.Code() == wasmtime.TrapCodeStackOverflow {
				return ExecutionResult{
					Success: false,
					Error: NewWasmError(
						ErrorTypeTrap,
						"stack overflow during execution",
						err,
					),
				}
			}
			if trap.Code() == wasmtime.TrapCodeMemoryOutOfBounds {
				return ExecutionResult{
					Success: false,
					Error: ErrMemoryLimit,
				}
			}
			return ExecutionResult{
				Success: false,
				Error: NewWasmError(
					ErrorTypeTrap,
					fmt.Sprintf("execution trap: %s", trap.Message()),
					err,
				),
			}
		}
		return ExecutionResult{
			Success: false,
			Error: NewWasmError(
				ErrorTypeExecution,
				"execution failed",
				err,
			),
		}
	}

	fuelRemaining, _ := store.Fuel()
	fuelUsed := MaxFuel - fuelRemaining

	if fuelRemaining == 0 {
		return ExecutionResult{
			FuelUsed: fuelUsed,
			Success:  false,
			Error:    ErrFuelExhausted,
		}
	}

	var result int64
	switch v := results.(type) {
	case int32:
		result = int64(v)
	case int64:
		result = v
	case uint32:
		result = int64(v)
	case uint64:
		result = int64(v)
	case float32:
		result = int64(v)
	case float64:
		result = int64(v)
	default:
		return ExecutionResult{
			FuelUsed: fuelUsed,
			Success:  false,
			Error: NewWasmError(
				ErrorTypeInvalidResult,
				fmt.Sprintf("unsupported result type: %T", v),
				nil,
			),
		}
	}

	runtime.Gosched()

	return ExecutionResult{
		Result:   result,
		FuelUsed: fuelUsed,
		Success:  true,
	}
}

func ExecuteWasm(wasmPath string, funcName string, input int64) (int64, error) {
	runner := NewRunner()
	result := runner.Execute(wasmPath, funcName, input)
	if !result.Success {
		return 0, result.Error
	}
	return result.Result, nil
}
