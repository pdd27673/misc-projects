import Foundation
import Carbon.HIToolbox
import AppKit

/// Registers a single global hotkey via the Carbon Hot Key API
/// (`RegisterEventHotKey`). This path does not require Input Monitoring, unlike
/// a CGEventTap listener — a deliberate simplification for v1.
///
/// Default binding: ⌥⌘C ("capture current problem").
final class HotkeyManager {

    /// Called on the main queue when the hotkey fires.
    var onTrigger: (() -> Void)?

    private var hotKeyRef: EventHotKeyRef?
    private var eventHandler: EventHandlerRef?
    private let signature: OSType = fourCharCode("MCch")
    private let id: UInt32 = 1

    /// Register the hotkey. `keyCode` is a Carbon virtual key code; `modifiers`
    /// is a Carbon modifier mask (e.g. `cmdKey | optionKey`).
    func register(keyCode: UInt32 = UInt32(kVK_ANSI_C),
                  modifiers: UInt32 = UInt32(cmdKey | optionKey)) {
        unregister()
        installHandlerIfNeeded()

        var ref: EventHotKeyRef?
        let hotKeyID = EventHotKeyID(signature: signature, id: id)
        let status = RegisterEventHotKey(keyCode, modifiers, hotKeyID,
                                         GetEventDispatcherTarget(), 0, &ref)
        if status == noErr { hotKeyRef = ref }
    }

    func unregister() {
        if let ref = hotKeyRef { UnregisterEventHotKey(ref); hotKeyRef = nil }
    }

    private func installHandlerIfNeeded() {
        guard eventHandler == nil else { return }
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard),
                                 eventKind: UInt32(kEventHotKeyPressed))
        let selfPtr = Unmanaged.passUnretained(self).toOpaque()
        InstallEventHandler(GetEventDispatcherTarget(), { _, event, userData in
            guard let userData else { return noErr }
            let manager = Unmanaged<HotkeyManager>.fromOpaque(userData).takeUnretainedValue()
            var hkID = EventHotKeyID()
            GetEventParameter(event, EventParamName(kEventParamDirectObject),
                              EventParamType(typeEventHotKeyID), nil,
                              MemoryLayout<EventHotKeyID>.size, nil, &hkID)
            if hkID.id == manager.id {
                DispatchQueue.main.async { manager.onTrigger?() }
            }
            return noErr
        }, 1, &spec, selfPtr, &eventHandler)
    }

    deinit { unregister() }
}

/// Build an `OSType` four-char code from a 4-character string.
private func fourCharCode(_ string: String) -> OSType {
    var result: OSType = 0
    for scalar in string.unicodeScalars.prefix(4) {
        result = (result << 8) + OSType(scalar.value & 0xFF)
    }
    return result
}
