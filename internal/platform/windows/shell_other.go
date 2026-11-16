//go:build !windows

package windows

// RegisterRecentDoc is a no-op on non-Windows platforms.
func RegisterRecentDoc(filePath string) error {
	return nil
}

// RevealInExplorer is a no-op on non-Windows platforms.
func RevealInExplorer(targetPath string) error {
	return nil
}
