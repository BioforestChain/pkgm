use crate::page::*;

use crate::browser_content::BrowserContentViewer;
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

// #[derive(Clone)]
pub struct Browser {
    id: String,
    // siv: &'static CursiveRunnable,
    // siv_caller: Box<dyn FnOnce(&mut CursiveRunnable) -> dyn Any>,
    pages: HashMap<String, Rc<RefCell<Page>>>,
    view_bar: Rc<RefCell<BrowserTabBarViewer>>,
    view_content: BrowserContentViewer,
    view: ResizedView<LinearLayout>,
    selected_page_index: usize,
}
impl Browser {
    pub fn new(id: String /* siv_caller: F */) -> Self
// where
    //     F: 'static + FnOnce(&mut CursiveRunnable) -> dyn Any,
    {
        // let bar = Rc::new(RefCell::new(TabBar::new()));
        // let z = bar.borrow();
        let _tabbar_id = id.clone() + "::tab";
        let bar = Rc::new(RefCell::new(BrowserTabBarViewer::new()));
        let content = BrowserContentViewer::new();
        // let content_wrapper =
        Browser {
            id,
            // siv_caller: Box::new(siv_caller),
            view: LinearLayout::vertical()
                .child(bar.clone().borrow().clone())
                .child(ThemedView::new(
                    Theme::default().with(|theme| {
                        theme.palette[PaletteColor::View] = Color::Dark(BaseColor::Black);
                        theme.palette[PaletteColor::Primary] = Color::Light(BaseColor::White);
                        theme.palette[PaletteColor::TitlePrimary] = Color::Light(BaseColor::White);
                        theme.palette[PaletteColor::Highlight] = Color::Dark(BaseColor::White);
                        theme.shadow = false;
                    }),
                    Layer::new(content.clone()),
                ))
                .full_screen(),
            pages: HashMap::new(),
            view_bar: bar,
            view_content: content,
            selected_page_index: 0,
        }
    }
    fn with_layout<F, R>(&self, f: F) -> R
    where
        F: FnOnce(&LinearLayout) -> R,
    {
        self.view.with_view(f).unwrap()
    }
    fn with_layout_mut<F, R>(&mut self, f: F) -> R
    where
        F: FnOnce(&mut LinearLayout) -> R,
    {
        self.view.with_view_mut(f).unwrap()
    }
    fn with_tabbar<F, R>(&self, f: F) -> R
    where
        F: FnOnce(&BrowserTabBarViewer) -> R,
    {
        f(&*self.view_bar.borrow())
    }
    fn with_tabbar_mut<F, R>(&mut self, mut f: F) -> R
    where
        F: FnOnce(&mut BrowserTabBarViewer) -> R,
    {
        f(&mut self.view_bar.borrow_mut())
    }
    fn with_content<F, R>(&self, f: F) -> R
    where
        F: FnOnce(&LinearLayout) -> R,
    {
        f(&*self.view_content.view.borrow())
    }
    fn with_content_mut<F, R>(&mut self, mut f: F) -> R
    where
        F: FnOnce(&mut LinearLayout) -> R,
    {
        f(&mut self.view_content.view.borrow_mut())
    }

    pub fn add_page(&mut self, uri: String) {
        let page = Page::new(uri.clone());
        let page_rc = Rc::new(RefCell::new(page.clone()));
        self.with_tabbar_mut(|bar| {
            bar.add_tab(page_rc.borrow().tab.clone());
        });
        self.pages.insert(uri, page_rc);

        // 渲染
        self.selected_page_index = self.pages.len() - 1;
        self.render_select_page();
    }
    pub fn del_page(&mut self, uri: String) {
        if let Some(_del_page) = self.pages.remove(&uri) {
            self.render_select_page()
        }
    }

    fn render_select_page(&mut self) {
        let pages_count = self.pages.len();
        if pages_count == 0 {
            self.with_content_mut(|layout| {
                while layout.len() > 0 {
                    layout.remove_child(0);
                }
            });
            // self.with_layout_mut(|layout| {
            //     if layout.len() > 1 {
            //         layout.remove_child(1);
            //     }
            // });
        } else {
            if self.selected_page_index > pages_count - 1 {
                self.selected_page_index = pages_count - 1;
            }
            let selected_index = self.selected_page_index % pages_count;
            // let z = self.pages.iter().enumerate().cloned();
            let mut selected_page: Option<Page> = None;
            {
                for (i, (_, page)) in self.pages.iter().enumerate() {
                    if i == selected_index {
                        selected_page = Some(page.clone().borrow().clone());
                        break;
                    }
                }
            }
            if let Some(page) = selected_page {
                self.with_content_mut(|layout| {
                    while layout.len() > 0 {
                        layout.remove_child(0);
                    }
                    layout.add_child(page);
                });
            }
        }
    }

    pub fn select_page(&mut self, uri: String) {
        if let Some(select_page) = self.pages.get(&uri) {
            for (index, (key, _)) in self.pages.iter().enumerate() {
                if key == &uri {
                    self.selected_page_index = index;
                    self.render_select_page();
                    break;
                }
            }
        }
    }
    pub fn select_page_by_index(&mut self, index: usize) {
        if self.pages.len() > 0 {
            self.selected_page_index = index % self.pages.len();
            self.render_select_page();
        }
    }
}
impl View for Browser {
    fn draw(&self, printer: &Printer) {
        self.view.draw(printer);
    }
    fn required_size(&mut self, constraint: Vec2) -> Vec2 {
        self.view.required_size(constraint)
    }

    fn on_event(&mut self, ch: Event) -> EventResult {
        self.view.on_event(ch)
    }

    fn layout(&mut self, size: Vec2) {
        self.view.layout(size);
    }

    fn take_focus(&mut self, source: Direction) -> Result<EventResult, CannotFocus> {
        self.view.take_focus(source)
    }

    fn call_on_any<'a>(&mut self, selector: &Selector<'_>, callback: AnyCb<'a>) {
        self.view.call_on_any(selector, callback)
    }

    fn needs_relayout(&self) -> bool {
        self.view.needs_relayout()
    }

    fn focus_view(&mut self, selector: &Selector<'_>) -> Result<EventResult, ViewNotFound> {
        self.view.focus_view(selector)
    }

    fn important_area(&self, size: Vec2) -> Rect {
        self.view.important_area(size)
    }
}
// pub struct SimpleBrowser {
//     tabs: Vec<String>,
//     content: Vec<String>,
//     selected_index: usize,
//     bar: Rc<RefCell<TabBar>>,
// }
// impl SimpleBrowser {
//     pub fn new(id: String) -> Self {
//         SimpleBrowser {
//             tabs: Vec::new(),
//             content: Vec::new(),
//             selected_index: 0,
//             bar: Rc::new(RefCell::new(TabBar::new())),
//         }
//     }
//     pub fn add_page(self: &mut SimpleBrowser, title: &str, content: &str) {
//         self.tabs.push(title.to_string());
//         self.content.push(content.to_string());
//     }
//     pub fn del_page(self: &mut SimpleBrowser, index: usize) {
//         self.tabs.remove(index);
//         self.content.remove(index);
//     }

//     pub fn map<F>(&mut self, mut mapper: F)
//     where
//         F: FnMut(&String, &String, usize, bool),
//     {
//         mapper(&"tab".to_owned(), &"content".to_owned(), 0, false);
//         for (i, tab) in self.tabs.iter().enumerate() {
//             mapper(
//                 tab,
//                 self.content.get(i).unwrap(),
//                 i,
//                 self.selected_index == i,
//             );
//         }
//     }
// }
// impl View for SimpleBrowser {
//     fn draw(&self, printer: &Printer) {
//         // self.view.draw(printer)
//         self.bar.borrow().draw(printer);
//         // printer.print((5, 5), "qaq")
//     }
//     // fn needs_relayout
// }
