use cursive::traits::{Nameable, View};
use cursive::views::{DebugView, Dialog, ScrollView};

pub struct DebugPanel {
    pub view: Dialog,
}

impl DebugPanel {
    pub fn new(title: String) -> Self {
        DebugPanel {
            view: Dialog::around(
                ScrollView::new(DebugView::new().with_name(title.clone() + "_console"))
                    .scroll_x(true),
            )
            .title(title),
        }
    }
}

impl View for DebugPanel {
    fn draw(&self, printer: &cursive::Printer) {
        self.view.draw(printer);
    }
}
