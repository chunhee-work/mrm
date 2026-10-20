import CoreGraphics
import Foundation
let a = CommandLine.arguments; let p = CGPoint(x: Double(a[1])!, y: Double(a[2])!)
let right = a.count > 3 && a[3] == "r"
let (dn, up, b): (CGEventType, CGEventType, CGMouseButton) = right ? (.rightMouseDown, .rightMouseUp, .right) : (.leftMouseDown, .leftMouseUp, .left)
let src = CGEventSource(stateID: .hidSystemState)
CGEvent(mouseEventSource: src, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
usleep(300000)
let d = CGEvent(mouseEventSource: src, mouseType: dn, mouseCursorPosition: p, mouseButton: b)!; d.setIntegerValueField(.mouseEventClickState, value: 1); d.post(tap: .cghidEventTap)
usleep(120000)
let u = CGEvent(mouseEventSource: src, mouseType: up, mouseCursorPosition: p, mouseButton: b)!; u.setIntegerValueField(.mouseEventClickState, value: 1); u.post(tap: .cghidEventTap)
