use cursive::view::View;
use cursive::views::TextView;
use cursive::{Printer, Vec2};
use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::rc::Rc;

#[derive(Debug, PartialEq, Eq, Hash)]
pub enum TabStatus {
    Success,
    Error,
    Warn,
    Loading,
    Info,
}
// impl IndexMut<TabStatus> for HashMap<TabStatus,dyn Any> {
//     fn index_mut<'a>(&'a mut self, index: TabStatus) -> &'a mut Weight {
//         println!("Accessing {:?}-side of balance mutably", index);
//         match index {
//             Side::Left => &mut self.left,
//             Side::Right => &mut self.right,
//         }
//     }
// }

pub struct PageTab {
    text: TextView,
    icon: Rc<RefCell<TextView>>,
    id: String,
    status: HashMap<TabStatus, HashSet<String>>,
}

impl PageTab {
    pub fn new(id: String) -> Self {
        PageTab {
            id: id.clone(),
            text: TextView::new(id),
            icon: Rc::new(RefCell::new(TextView::new(""))),
            status: HashMap::new(),
            // view: FocusTracker::new(&textview),
        }
    }

    pub fn set_content(&mut self, title: String) {
        self.text.set_content(title);
    }

    pub fn add_status(&mut self, status: TabStatus, reason: String) {
        let mut changed = false;
        match self.status.get_mut(&status) {
            Some(reasons) => {
                changed = reasons.insert(reason);
            }
            None => {
                let mut hash_set = HashSet::<String>::new();
                changed = hash_set.insert(reason);
                self.status.insert(status, hash_set);
            }
        }
        if changed {
            self.update_icon()
        }
    }
    pub fn del_status(&mut self, status: TabStatus, reason: String) {
        let mut changed = false;
        match self.status.get_mut(&status) {
            Some(reasons) => {
                changed = reasons.remove(&reason);
            }
            None => {}
        }
        if changed {
            self.update_icon()
        }
    }
    fn update_icon(&mut self) {
        let mut icon: String = "".to_owned();
        for status in self.status.keys() {
            match status {
                TabStatus::Success => icon += "✓",
                TabStatus::Error => icon += "X",
                TabStatus::Warn => icon += "⚠",
                TabStatus::Loading => icon += "~",
                TabStatus::Info => icon += "i",
            }
        }
        self.icon.borrow_mut().set_content(icon);
    }
}

impl View for PageTab {
    fn draw(&self, printer: &Printer) {
        self.icon.borrow().draw(printer);
        let icon_draw_size = self.icon.borrow_mut().required_size(printer.output_size);
        self.text
            .draw(&printer.offset(icon_draw_size.map_x(|x| x + 1)));
    }
    fn layout(&mut self, size: Vec2) {
        self.icon.borrow_mut().layout(size);
        self.text.layout(size);
    }

    fn required_size(&mut self, constraint: Vec2) -> Vec2 {
        let text_require_size = self.text.required_size(constraint);
        let icon_require_size = self.icon.borrow_mut().required_size(constraint);
        icon_require_size + Vec2::new(1, 0) + text_require_size
    }
}
