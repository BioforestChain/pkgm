use cursive::traits::View;
use cursive::views::{DebugView, Dialog, ScrollView};

pub struct DebugPanel {
    // pub view: HideableView<DebugView>,
    pub view: Dialog,
}

impl DebugPanel {
    pub fn new(title: String) -> Self {
        DebugPanel {
            // view: HideableView::new(DebugView::new()),
            view: Dialog::around(ScrollView::new(DebugView::new()).scroll_x(true)).title(title),
        }
    }

    // pub fn show_debug_panel(&mut self, visible: bool) {
    //     self.view.set_visible(visible);
    // }
}

impl View for DebugPanel {
    fn draw(&self, printer: &cursive::Printer) {
        self.view.draw(printer);
    }
}
