use core::cell::RefCell;
use std::rc::Rc;

use cursive::view::{SizeConstraint, View};

use cursive::views::{ResizedView, TextView};
use cursive::{self};
use cursive::{Printer, Vec2};

use super::page_tab::PageTab;

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

        // 设置长文本换行
        content.borrow_mut().get_inner_mut().set_content_wrap(true);

        Page {
            tab: tab,
            // tab: Box::new(tab),
            content,
        }
    }
    pub fn set_title(&mut self, title: String) {
        self.tab.borrow_mut().set_content(title);
    }
    // pub fn get_tab(self: Page) -> Ref<'_, PageTab> {
    //     self.tab.borrow()
    // }
    pub fn set_width(&mut self, width: usize) {
        self.content
            .borrow_mut()
            .set_width(SizeConstraint::Fixed(width));
    }
    pub fn set_height(&mut self, height: usize) {
        self.content
            .borrow_mut()
            .set_height(SizeConstraint::Fixed(height));
    }

    pub fn append_content(&mut self, content: String) {
        let new_content = "\n".to_string() + content.as_str();
        self.content
            .borrow_mut()
            .get_inner_mut()
            .append(new_content);
    }

    // 设置内容，会清空原内容
    pub fn set_content(&mut self, content: String) {
        self.content
            .borrow_mut()
            .get_inner_mut()
            .set_content(content);
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
