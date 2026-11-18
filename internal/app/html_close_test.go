package app

import (
	"github.com/wailsapp/wails/v3/pkg/application"
	"sync/atomic"
	"testing"
	"time"
)

func TestHtmlSaveCloseGuardWaitsWithoutBlockingAndClosesOnce(t *testing.T) {
	var busy atomic.Bool
	busy.Store(true)
	closed := make(chan struct{}, 2)
	guard := htmlSaveCloseGuard(busy.Load, func() { closed <- struct{}{} }, func() {})
	first, second := &application.WindowEvent{}, &application.WindowEvent{}
	guard(first)
	guard(second)
	if !first.IsCancelled() || !second.IsCancelled() {
		t.Fatal("close must be cancelled during save")
	}
	select {
	case <-closed:
		t.Fatal("window closed before save finished")
	default:
	}
	busy.Store(false)
	select {
	case <-closed:
	case <-time.After(time.Second):
		t.Fatal("window did not close after save")
	}
	select {
	case <-closed:
		t.Fatal("duplicate close")
	default:
	}
}
