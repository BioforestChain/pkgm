use crate::page::*;

use crate::tabbar::*;
use cursive::{
    direction::Direction,
    event::{AnyCb, Event, EventResult},
    theme::{BaseColor, Color, PaletteColor, Theme},
    view::{CannotFocus, Resizable, Selector, View, ViewNotFound, ViewWrapper},
    views::{Layer, LinearLayout, ResizedView, ThemedView},
    Printer, Rect, Vec2, With,
};

use std::cell::RefCell;
use std::cmp::max;
use std::collections::HashMap;
use std::rc::Rc;

pub struct BrowserContentViewer {
    pub view: Rc<RefCell<LinearLayout>>,
}
impl BrowserContentViewer {
    pub fn new() -> Self {
        BrowserContentViewer {
            view: Rc::new(RefCell::new(LinearLayout::horizontal())),
        }
    }
}
impl Clone for BrowserContentViewer {
    fn clone(&self) -> Self {
        BrowserContentViewer {
            view: self.view.clone(),
        }
    }
}
impl View for BrowserContentViewer {
    fn draw(&self, printer: &Printer) {
        self.view.borrow().draw(printer);
    }
    fn required_size(&mut self, constraint: Vec2) -> Vec2 {
        self.view.borrow_mut().required_size(constraint)
    }

    fn on_event(&mut self, ch: Event) -> EventResult {
        self.view.borrow_mut().on_event(ch)
    }

    fn layout(&mut self, size: Vec2) {
        self.view.borrow_mut().layout(size);
    }

    fn take_focus(&mut self, source: Direction) -> Result<EventResult, CannotFocus> {
        self.view.borrow_mut().take_focus(source)
    }

    fn call_on_any<'a>(&mut self, selector: &Selector<'_>, callback: AnyCb<'a>) {
        self.view.borrow_mut().call_on_any(selector, callback)
    }

    fn needs_relayout(&self) -> bool {
        self.view.borrow().needs_relayout()
    }

    fn focus_view(&mut self, selector: &Selector<'_>) -> Result<EventResult, ViewNotFound> {
        self.view.borrow_mut().focus_view(selector)
    }

    fn important_area(&self, size: Vec2) -> Rect {
        self.view.borrow().important_area(size)
    }
}
