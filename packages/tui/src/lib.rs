//! This crate provides a tabbing view for
//! [gyscos/cursive](https://github.com/gyscos/cursive) views. It is build to
//! be as simple as possible.
//!
//! The behaviour is oriented to be similar to  [`StackView`](https://docs.rs/cursive/0.13.0/cursive/views/struct.StackView.html) of cursive, but with the advantage of selectively displaying
//! views without needing to delete foremost one.
//!
//! # Example
//! All you need to do to create a new `TabView` is:
//! ```
//! # use cursive::{view::Nameable, views::{TextView, Dialog}};
//! # use cursive_tabs::TabView;
//! # let mut siv = cursive::default();
//! let mut tabs = TabView::new();
//! # // That is all what is needed to display an empty TabView, but of course
//! # // you can add your own tabs now and switch them around as you want!
//! # tabs.add_tab(TextView::new("Our first view!").with_name("First"));
//! # siv.add_layer(Dialog::around(tabs));
//! # // When your done setting run cursive
//! # // siv.run();
//! ```
//! You can then use the provided methods to modify the content of the `TabView`
//! Consuming and non-consuming are both provided.
//!
//! # Full Example
//! ```
//! use cursive::{view::Nameable, views::{TextView, Dialog}};
//! use cursive_tabs::TabView;
//!
//! let mut siv = cursive::default();
//! let mut tabs = TabView::new();
//! // That is all what is needed to display an empty TabView, but of course
//! // you can add your own tabs now and switch them around as you want!
//! tabs.add_tab(TextView::new("Our first view!").with_name("First"));
//! siv.add_layer(Dialog::around(tabs));
//! // When your done setting run cursive
//! // siv.run();
//! ```
extern crate cursive_core as cursive;

use crossbeam::channel::{Receiver, Sender};
use cursive::direction::Direction;
use cursive::event::{AnyCb, Event, EventResult};
use cursive::view::{CannotFocus, Selector, View, ViewNotFound};
use cursive::views::NamedView;
use cursive::{Printer, Rect, Vec2};
use log::debug;
use std::collections::HashMap;

mod bar;
mod error;
mod panel;

// Reexports
use bar::{Bar, TabBar};
pub use panel::{Align, Placement, TabPanel};
/// Main struct which manages views
pub struct TabView {
    current_id: Option<String>,
    // 0.6 版将其更改为仅包含 NamedViews，但在地图中这仍然是相同的类型
    // 因为 NamedViews 由于其封闭的视图特征对象而无法正确调整大小
    map: HashMap<String, Box<dyn View>>,
    key_order: Vec<String>,
    bar_rx: Option<Receiver<String>>,
    active_key_tx: Option<Sender<String>>,
    invalidated: bool,
}

impl Default for TabView {
    fn default() -> Self {
        Self::new()
    }
}

impl TabView {
    /// Returns a new TabView
    /// # Example
    /// ```
    /// # use cursive::{view::Nameable, views::{TextView, Dialog}};
    /// # use cursive_tabs::TabView;
    /// #  let mut siv = cursive::default();
    /// let mut tabs = TabView::new();
    /// #  // That is all what is needed to display an empty TabView, but of course
    /// #  // you can add your own tabs now and switch them around as you want!
    /// #  tabs.add_tab(TextView::new("Our first view!").with_name("First"));
    /// #  siv.add_layer(Dialog::around(tabs));
    /// #  // When your done setting run cursive
    /// #  // siv.run();
    /// ```
    pub fn new() -> Self {
        Self {
            current_id: None,
            map: HashMap::new(),
            key_order: Vec::new(),
            bar_rx: None,
            active_key_tx: None,
            invalidated: true,
        }
    }

    /// Returns the currently active tab Id.
    pub fn active_tab(&self) -> Option<&str> {
        self.current_id.as_deref()
    }

    /// Returns a reference to the underlying view.
    pub fn active_view(&self) -> Option<&dyn View> {
        self.active_tab()
            .and_then(|k| self.map.get(k).map(|v| &**v))
    }

    /// 返回对基础视图的可变引用。
    pub fn active_view_mut(&mut self) -> Option<&mut dyn View> {
        if let Some(k) = self.current_id.as_ref() {
            self.map.get_mut(k).map(|v| &mut **v)
        } else {
            None
        }
    }

    pub fn views(&self) -> Vec<&dyn View> {
        self.map.values().map(|v| &**v).collect()
    }

    // Mutable references to all mutable views.
    pub fn views_mut(&mut self) -> Vec<&mut dyn View> {
        self.map.values_mut().map(|v| &mut **v).collect()
    }

    /// 设置当前活动（可见）选项卡。
    /// 如果不知道tab id，则返回错误，不执行任何操作。
    pub fn set_active_tab(&mut self, id: &str) -> Result<(), error::IdNotFound> {
        if self.map.contains_key(id) {
            if let Some(sender) = &self.active_key_tx {
                match sender.send(id.to_owned()) {
                    Ok(_) => {}
                    Err(e) => debug!(
                        "error occured while trying to send new active key to sender: {}",
                        e
                    ),
                }
            }
            self.current_id = Some(id.to_owned());
            self.invalidated = true;
            Ok(())
        } else {
            Err(error::IdNotFound { id: id.to_owned() })
        }
    }

    /// 设置当前活动（可见）选项卡。
    /// 如果不知道tab id，则返回错误，不执行任何操作。
    ///
    /// 这是消耗品变体。
    pub fn with_active_tab(mut self, id: &str) -> Result<Self, Self> {
        match self.set_active_tab(id) {
            Ok(_) => Ok(self),
            Err(_) => Err(self),
        }
    }

    /// 在标签视图中添加一个新标签。
    /// 新选项卡将被设置为活动状态，并将成为此选项卡视图的可见选项卡。
    pub fn add_tab<T: View>(&mut self, view: NamedView<T>) {
        let id = view.name().to_owned();
        self.map.insert(id.clone(), Box::new(view));
        self.key_order.push(id.clone());
        self.current_id = Some(id);
    }

    /// 在标签视图中添加一个新标签。
    /// 新选项卡将被设置为活动状态，并将成为此选项卡视图的可见选项卡。
    ///
    /// 这是消耗品变体。
    pub fn with_tab<T: View>(mut self, view: NamedView<T>) -> Self {
        self.add_tab(view);
        self
    }

    /// 在给定位置添加一个新标签。
    /// 新选项卡将被设置为活动状态，并将成为此选项卡视图的可见选项卡。
    ///
    /// 这被设计成不会失败，如果给定的位置大于当前标签的数量，它会被简单地追加。
    pub fn add_tab_at<T: View>(&mut self, view: NamedView<T>, pos: usize) {
        let id = view.name().to_owned();
        self.map.insert(id.clone(), Box::new(view));
        if let Some(sender) = &self.active_key_tx {
            match sender.send(id.clone()) {
                Ok(_) => {}
                Err(send_err) => debug!(
                    "Could not send new key to receiver in TabBar, has it been dropped? {}",
                    send_err
                ),
            }
        }
        self.current_id = Some(id.clone());
        if self.key_order.len() > pos {
            self.key_order.insert(pos, id)
        } else {
            self.key_order.push(id);
        }
    }

    /// 在给定位置添加一个新标签。
    /// 新选项卡将被设置为活动状态，并将成为此选项卡视图的可见选项卡。
    ///
    /// 它被设计成故障安全的，如果给定的位置大于当前选项卡的数量，它将被简单地附加。
    ///
    /// 这是消耗品变体。
    pub fn with_tab_at<T: View>(mut self, view: NamedView<T>, pos: usize) -> Self {
        self.add_tab_at(view, pos);
        self
    }

    ///交换标签的位置
    /// If one of the given key cannot be found, then no operation is performed.
    pub fn swap_tabs(&mut self, fst: &str, snd: &str) {
        let mut fst_pos: Option<usize> = None;
        let mut snd_pos: Option<usize> = None;
        for (pos, key) in self.tab_order().into_iter().enumerate() {
            match key {
                val if val == *fst => fst_pos = Some(pos),
                val if val == *snd => snd_pos = Some(pos),
                _ => {}
            }
        }
        if let (Some(fst_pos), Some(snd_pos)) = (fst_pos, snd_pos) {
            if let Some(cur) = self.current_id.as_ref() {
                if self.active_key_tx.is_some() && (fst == cur || snd == cur) {
                    self.active_key_tx
                        .as_mut()
                        .unwrap()
                        .send(cur.to_owned())
                        .expect("Sending failed.");
                }
            }
            self.key_order.swap(fst_pos, snd_pos);
        }
    }

    /// 从 `TabView` 中删除具有给定 id 的选项卡。
    /// 如果移除的选项卡此时处于活动状态，则 `TabView` 将取消焦点并
    /// 之后需要手动设置焦点，否则必须插入新视图。
    pub fn remove_tab(&mut self, id: &str) -> Result<(), error::IdNotFound> {
        if self.map.remove(id).is_some() {
            if let Some(key) = &self.current_id {
                if key == id {
                    // Current id no longer valid
                    self.current_id = None;
                }
            }
            // remove_key experimental
            self.key_order.retain(|k| k != id);
            self.invalidated = true;
            Ok(())
        } else {
            Err(error::IdNotFound { id: id.to_owned() })
        }
    }

    /// 返回向量中键的当前顺序。
    /// 当您实现自己的标签栏时，请注意这是当前的
    /// tab bar 并且只是原始命令的一个副本，不会被修改
    /// 已传输且未显示原始版本中的未来更新。
    pub fn tab_order(&self) -> Vec<String> {
        self.key_order.clone()
    }

    // 返回键的索引，如果键不包含则返回向量的长度
    // 这可以在没有排序的情况下完成
    fn index_key(cur_key: &str, key_order: &[String]) -> usize {
        for (idx, key) in key_order.iter().enumerate() {
            if *key == *cur_key {
                return idx;
            }
        }
        key_order.len()
    }

    /// 按顺序将活动选项卡设置为下一个选项卡。
    pub fn next(&mut self) {
        if let Some(cur_key) = &self.current_id {
            let idx = (Self::index_key(&cur_key, &self.key_order) + 1) % self.key_order.len();

            let key = &self.key_order[idx].clone();
            self.set_active_tab(key)
                .expect("Key content changed during operation, this should not happen");
        }
    }

    /// Set the active tab to the previous tab in order.
    pub fn prev(&mut self) {
        if let Some(cur_key) = self.current_id.as_ref().cloned() {
            let idx_key = Self::index_key(&cur_key, &self.key_order);
            let idx = (self.key_order.len() + idx_key - 1) % self.key_order.len();

            let key = &self.key_order[idx].clone();
            self.set_active_tab(key)
                .expect("Key content changed during operation, this should not happen");
        }
    }

    /// Set the receiver for keys to be changed to
    pub fn set_bar_rx(&mut self, rx: Receiver<String>) {
        self.bar_rx = Some(rx);
    }

    /// Set the sender for the key switched to
    pub fn set_active_key_tx(&mut self, tx: Sender<String>) {
        self.active_key_tx = Some(tx);
    }
}

impl View for TabView {
    fn draw(&self, printer: &Printer) {
        if let Some(key) = &self.current_id {
            if let Some(view) = self.map.get(key) {
                view.draw(printer);
            }
        }
    }

    fn layout(&mut self, size: Vec2) {
        self.invalidated = false;
        if let Some(key) = &self.current_id {
            if let Some(view) = self.map.get_mut(key) {
                view.layout(size);
            }
        }
    }

    fn required_size(&mut self, req: Vec2) -> Vec2 {
        if let Some(rx) = &self.bar_rx {
            if let Ok(evt) = rx.try_recv() {
                match self.set_active_tab(&evt) {
                    Ok(_) => {}
                    Err(err) => debug!("could not accept tab bar event: {:?}", err),
                }
            }
        }
        if let Some(key) = &self.current_id {
            if let Some(view) = self.map.get_mut(key) {
                view.required_size(req)
            } else {
                (1, 1).into()
            }
        } else {
            (1, 1).into()
        }
    }

    fn on_event(&mut self, evt: Event) -> EventResult {
        if let Some(key) = &self.current_id {
            if let Some(view) = self.map.get_mut(key) {
                view.on_event(evt)
            } else {
                EventResult::Ignored
            }
        } else {
            EventResult::Ignored
        }
    }

    fn take_focus(&mut self, src: Direction) -> Result<EventResult, CannotFocus> {
        if let Some(key) = &self.current_id {
            if let Some(view) = self.map.get_mut(key) {
                view.take_focus(src)
            } else {
                Err(CannotFocus)
            }
        } else {
            Err(CannotFocus)
        }
    }

    fn call_on_any<'a>(&mut self, slt: &Selector, cb: AnyCb<'a>) {
        for (_, view) in self.map.iter_mut() {
            view.call_on_any(slt, cb);
        }
    }

    fn focus_view(&mut self, slt: &Selector) -> Result<EventResult, ViewNotFound> {
        if let Some(key) = &self.current_id {
            if let Some(view) = self.map.get_mut(key) {
                view.focus_view(slt)
            } else {
                Err(ViewNotFound)
            }
        } else {
            Err(ViewNotFound)
        }
    }

    fn needs_relayout(&self) -> bool {
        self.invalidated || {
            if let Some(key) = &self.current_id {
                if let Some(view) = self.map.get(key) {
                    view.needs_relayout()
                } else {
                    false
                }
            } else {
                false
            }
        }
    }

    fn important_area(&self, size: Vec2) -> Rect {
        if let Some(key) = &self.current_id {
            if let Some(view) = self.map.get(key) {
                view.important_area(size)
            } else {
                Rect::from_point((1, 1))
            }
        } else {
            Rect::from_point((1, 1))
        }
    }
}

#[cfg(test)]
mod test {
    use super::TabView;
    use cursive::{traits::Nameable, views::DummyView};

    #[test]
    fn smoke() {
        let _ = TabView::new();
    }

    #[test]
    fn insert() {
        let mut tabs = TabView::new().with_tab(DummyView {}.with_name("0"));
        tabs.add_tab(DummyView {}.with_name("1"));
    }

    #[test]
    fn switch() {
        let mut tabs = TabView::new();
        tabs.add_tab(DummyView {}.with_name("0"));
        tabs.add_tab(DummyView {}.with_name("1"));
        assert_eq!(tabs.active_tab().expect("Id not correct"), "1");
        tabs.set_active_tab("0").expect("Id not taken");
        assert_eq!(tabs.active_tab().expect("Id not correct"), "0");
    }

    #[test]
    fn remove() {
        let mut tabs = TabView::new();
        tabs.add_tab(DummyView {}.with_name("0"));
        tabs.add_tab(DummyView {}.with_name("1"));
        assert_eq!(tabs.remove_tab("1"), Ok(()));
        assert!(tabs.active_tab().is_none());
    }
}
