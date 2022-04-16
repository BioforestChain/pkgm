use crate::page_tab::PageTab;
use core::cell::RefCell;

use cursive::view::{SizeConstraint, View, ViewWrapper};

use cursive::views::{ResizedView, TextView};
use cursive::{self};
use cursive::{Printer, Vec2};

use std::rc::Rc;

#[derive(Clone)]
pub struct Page {
    // tab: Box<PageTab>,
    pub tab: Rc<RefCell<PageTab>>,
    content: Rc<RefCell<ResizedView<TextView>>>,
}
impl Page {
    pub fn new(title: String) -> Self {
        let tab = Rc::new(RefCell::new(PageTab::new(title.clone())));
        let content = Rc::new(RefCell::new(ResizedView::with_full_screen(TextView::new(
            format!("status 404 on page {}", title),
        ))));
        Page {
            tab: tab,
            // tab: Box::new(tab),
            content,
        }
    }
    pub fn set_title(self: &mut Page, title: String) {
        self.tab.borrow_mut().set_content(title);
    }
    // pub fn get_tab(self: Page) -> Ref<'_, PageTab> {
    //     self.tab.borrow()
    // }
    pub fn set_width(self: &mut Page, width: usize) {
        self.content
            .borrow_mut()
            .set_width(SizeConstraint::Fixed(width));
    }
    pub fn set_height(self: &mut Page, height: usize) {
        self.content
            .borrow_mut()
            .set_height(SizeConstraint::Fixed(height));
    }
}

// impl ViewWrapper for Page {
//     cursive::wrap_impl!(self.content.borrow_mut(): T);
// }
impl View for Page {
    fn draw(&self, printer: &Printer) {
        self.content.borrow_mut().draw(printer);
    }
    fn required_size(&mut self, constraint: Vec2) -> Vec2 {
        self.content.borrow_mut().required_size(constraint)
    }
}

// impl ViewWrapper for Page {
//     wrap_impl!(self.content);
// }
