use crate::panel::{Align, Placement};
use core::cell::RefCell;

use cursive::view::{Resizable, SizeConstraint, View};
use cursive::views::{Button, ResizedView};
use cursive::{Printer, Vec2};

/// 定义标签栏应该能够处理哪些基本操作的特征
pub trait Bar {
    fn add_button(&mut self, tx: Sender<String>, key: &str);
    fn remove_button(&mut self, key: &str);
    fn swap_button(&mut self, left: &str, right: &str);
    fn add_button_at(&mut self, tx: Sender<String>, key: &str, pos: usize);
}

// 视图周围的快速包装器能够设置它们的位置
struct PositionWrap<T: View> {
    view: T,
    pub pos: Vec2,
    pub key: String,
}

impl<T: View> ViewWrapper for PositionWrap<T> {
    wrap_impl!(self.view: T);
}

impl<T: View> PositionWrap<T> {
    pub fn new(view: T, key: String) -> Self {
        Self {
            view,
            pos: Vec2::zero(),
            key,
        }
    }
}

// #[derive(Clone)]
pub struct BrowserTabBarViewer {
    children: Vec<PositionWrap<Button>>,
    bar_size: Vec2,
    align: Align,
    last_rendered_size: Vec2, // 累计的数量
    sizes: Vec<Vec2>,
    placement: Placement,
    cursor: Option<usize>,
    active: Option<usize>,
    rx: Receiver<String>,
    invalidated: bool, // 是否有效
}

impl Clone for BrowserTabBarViewer {
    fn clone(&self) -> BrowserTabBarViewer {
        BrowserTabBarViewer {
            tabs: self.tabs.clone(),
            sizes: Vec::new(),
            bar_size: Vec2::zero(),
            cursor: None,
            active: None,
            placement: Placement::HorizontalTop,
            invalidated: false,
        }
    }
}

impl BrowserTabBarViewer {
    pub fn new() -> Self {
        // let width: usize = 10;
        BrowserTabBarViewer {
            tabs: Rc::new(RefCell::new(Vec::new())),
            sizes: Vec::new(),
            cursor: None,
            active: None,
            placement: Placement::HorizontalTop,
            bar_size: Vec2::zero(),
            invalidated: true,
            // view: Rc::new(RefCell::new(
            //     LinearLayout::horizontal().fixed_size(cursive::XY::new(width, 1)),
            // )),
            // width,
        }
    }
    pub fn add_tab(self: &mut BrowserTabBarViewer, tab: Rc<RefCell<PageTab>>) {
        self.tabs.borrow_mut().push(tab);
        self.cursor = Some(self.tabs.borrow_mut().len() - 1);
        self.active = Some(self.tabs.borrow_mut().len() - 1);
        self.invalidated = true;
    }
    // pub fn set_width(self: &mut TabBar, width: usize) {
    //     self.view
    //         .borrow_mut()
    //         .set_width(SizeConstraint::Fixed(width));
    // }
}
impl View for BrowserTabBarViewer {
    fn draw(&self, printer: &Printer) {
        let mut walk_size: usize = 0;
        let unit_size = printer.size.x / max(self.tabs.borrow().len(), 1);
        // printer.print((5, 5), "qaq");
        // printer.print((0, 0), &self.tabs.len().to_string());
        for (i, tab) in self.tabs.borrow().iter().enumerate() {
            let mut spliter = "|";
            if i == 0 {
                spliter = ""
            }
            printer.print(Vec2::new(walk_size, 0), spliter);
            let tab_printer = &printer
                .offset(Vec2::new(walk_size + spliter.len(), 0))
                .cropped(Vec2::new(unit_size - spliter.len(), 1));
            tab.borrow().draw(tab_printer);

            walk_size += unit_size;
        }
    }
    fn required_size(&mut self, _constraint: Vec2) -> Vec2 {
        let mut min_width = max(1, _constraint.x);
        for tab in self.tabs.borrow().iter() {
            min_width = max(tab.borrow_mut().required_size(_constraint).x, min_width)
        }
        Vec2::new(min_width, 1)
    }
}
