use crossbeam::channel::{unbounded, Sender};
use cursive::direction::{Absolute, Direction};
use cursive::event::{AnyCb, Event, EventResult, Key};
use cursive::view::{CannotFocus, Selector, View, ViewNotFound};
use cursive::views::NamedView;
use cursive::{Printer, Vec2};
use log::debug;
use num::clamp;

use crate::error;
use crate::Bar;
use crate::TabBar;
use crate::TabView;

#[derive(Clone, Copy, Debug)]
pub enum Align {
    Start,
    Center,
    End,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Placement {
    VerticalLeft,
    VerticalRight,
    HorizontalTop,
    HorizontalBottom,
}

impl Align {
    pub fn get_offset(self, content: usize, container: usize) -> usize {
        if container < content {
            0
        } else {
            match self {
                Align::Start => 0,
                Align::Center => (container - content) / 2,
                Align::End => container - content,
            }
        }
    }
}

/// `TabPanel` 是 `TabView` 及其 `TabBar` 的易用包装器。
/// 另外Panel中的TabBar可以水平对齐，默认设置为左对齐。
///
/// # Example
/// ```
/// use cursive_tabs::{Align, TabPanel};
/// use cursive::views::TextView;
/// use cursive::view::Nameable;
///
/// let mut tabs = TabPanel::new()
///       .with_tab(TextView::new("First").with_name("First"))
///       .with_tab(TextView::new("Second").with_name("Second"))
///       .with_bar_alignment(Align::Center);
/// ```
///
/// TabView 也可以单独使用，因此如果您更喜欢没有 TabBar 和 Panel 的选项卡，请查看“TabView”。
pub struct TabPanel {
    bar: TabBar,
    bar_size: Vec2,
    tab_size: Vec2,
    tx: Sender<String>,
    tabs: TabView,
    bar_focused: bool,
    bar_align: Align,
    bar_placement: Placement,
}

impl Default for TabPanel {
    fn default() -> Self {
        Self::new()
    }
}

impl TabPanel {
    /// 返回一个新的 TabPanel 实例。
    /// 对齐默认设置为左对齐，要更改此设置，请使用 `set_bar_alignment` 更改为 `cursive` 提供的任何其他 `HAlign`。
    pub fn new() -> Self {
        let mut tabs = TabView::new();
        let (tx, rx) = unbounded();
        let (active_tx, active_rx) = unbounded();
        tabs.set_bar_rx(rx);
        tabs.set_active_key_tx(active_tx);
        Self {
            bar: TabBar::new(active_rx)
                .with_placement(Placement::HorizontalTop)
                .with_alignment(Align::Start),
            bar_size: Vec2::new(1, 1),
            tab_size: Vec2::new(1, 1),
            tabs,
            tx,
            bar_focused: true,
            bar_align: Align::Start,
            bar_placement: Placement::HorizontalTop,
        }
    }

    /// 返回 `TabView` 的当前活动选项卡。
    /// 注意：在封闭的 `TabView` 上调用 `active_tab`。
    pub fn active_tab(&self) -> Option<&str> {
        self.tabs.active_tab()
    }

    /// 返回对基础视图的引用。
    pub fn active_view(&self) -> Option<&dyn View> {
        self.tabs.active_view()
    }

    /// 返回对基础视图的可变引用。
    pub fn active_view_mut(&mut self) -> Option<&mut dyn View> {
        self.tabs.active_view_mut()
    }

    pub fn views(&self) -> Vec<&dyn View> {
        self.tabs.views()
    }

    pub fn views_mut(&mut self) -> Vec<&mut dyn View> {
        self.tabs.views_mut()
    }

    /// 在 `TabView` 中设置活动选项卡的非消耗variant。
    /// 注意：在封闭的 `TabView` 上调用 `set_active_tab`。
    pub fn set_active_tab(&mut self, id: &str) -> Result<(), error::IdNotFound> {
        self.tabs.set_active_tab(id)
    }

    /// Consuming & Chainable variant在 `TabView` 中设置活动选项卡。
    /// 注意：在封闭的 `TabView` 上调用 `set_active_tab`。
    ///
    pub fn with_active_tab(mut self, id: &str) -> Result<Self, Self> {
        match self.tabs.set_active_tab(id) {
            Ok(_) => Ok(self),
            Err(_) => Err(self),
        }
    }

    /// 将新选项卡添加到 `TabView` 的非消耗变体。
    /// 注意：在封闭的 `TabView` 上调用 `add_tab`。
    pub fn add_tab<T: View>(&mut self, view: NamedView<T>) {
        let id = view.name();
        self.bar.add_button(self.tx.clone(), id);
        self.tabs.add_tab(view);
    }

    /// Consuming & Chainable 变体添加一个新标签。
    /// 注意：在封闭的 `TabView` 上调用 `add_tab`。
    pub fn with_tab<T: View>(mut self, view: NamedView<T>) -> Self {
        let id = view.name();
        self.bar.add_button(self.tx.clone(), id);
        self.tabs.add_tab(view);
        self
    }

    /// 交换给定的tab键。
    /// 如果至少有一个找不到，则不执行任何操作
    pub fn swap_tabs(&mut self, fst: &str, snd: &str) {
        self.tabs.swap_tabs(fst, snd);
        self.bar.swap_button(fst, snd);
    }

    /// 在特定位置向 `TabView` 添加新选项卡的非消耗变体。
    /// 这是故障安全的，如果位置大于制表符的数量，则将其附加到末尾。
    /// 注意：在封闭的 `TabView` 上调用 `add_tab_at`。
    pub fn add_tab_at<T: View>(&mut self, view: NamedView<T>, pos: usize) {
        let id = view.name();
        self.bar.add_button_at(self.tx.clone(), id, pos);
        self.tabs.add_tab_at(view, pos);
    }

    /// Consuming & Chainable 变体在特定位置添加新标签。
    /// 这是故障安全的，如果位置大于制表符的数量，则将其附加到末尾。
    /// 注意：在封闭的 `TabView` 上调用 `add_tab_at`。
    pub fn with_tab_at<T: View>(mut self, view: NamedView<T>, pos: usize) -> Self {
        let id = view.name();
        self.bar.add_button_at(self.tx.clone(), id, pos);
        self.tabs.add_tab_at(view, pos);
        self
    }

    /// 删除随附的标签 `TabView`.
    pub fn remove_tab(&mut self, id: &str) -> Result<(), error::IdNotFound> {
        self.bar.remove_button(id);
        self.tabs.remove_tab(id)
    }

    /// 下一个
    pub fn next(&mut self) {
        self.tabs.next()
    }

    /// 上一个
    pub fn prev(&mut self) {
        self.tabs.prev()
    }

    /// Consumable & Chainable variant 设置栏对齐。
    pub fn with_bar_alignment(mut self, align: Align) -> Self {
        self.set_bar_alignment(align);

        self
    }

    ///设置条形对齐的非消耗variant。
    pub fn set_bar_alignment(&mut self, align: Align) {
        self.bar_align = align;
        self.bar.set_alignment(align);
    }

    pub fn with_bar_placement(mut self, placement: Placement) -> Self {
        self.set_bar_placement(placement);
        self
    }

    pub fn set_bar_placement(&mut self, placement: Placement) {
        self.bar_placement = placement;
        self.bar.set_placement(placement);
    }

    ///以带有视图键的 Vector 形式返回选项卡的当前顺序。
    pub fn tab_order(&self) -> Vec<String> {
        self.tabs.tab_order()
    }

    // 打印与当前位置对应的行
    fn draw_outer_panel(&self, printer: &Printer) {
        match self.bar_placement {
            Placement::HorizontalTop => {
                // Side bars
                printer.print_vline((0, 0), printer.size.y, "│");
                printer.print_vline((printer.size.x - 1, 0), printer.size.y, "│");
                // Bottom line
                printer.print_hline((0, printer.size.y - 1), printer.size.x, "─");

                printer.print((0, self.bar_size.y - 1), "┌");
                printer.print((printer.size.x - 1, self.bar_size.y - 1), "┐");
                printer.print((0, printer.size.y - 1), "└");
                printer.print((printer.size.x - 1, printer.size.y - 1), "┘");
            }
            Placement::HorizontalBottom => {
                // Side bars
                printer.print_vline((0, 0), printer.size.y, "│");
                printer.print_vline((printer.size.x - 1, 0), printer.size.y, "│");
                // Top line
                let lowest = clamp(printer.size.y - self.bar_size.y, 0, printer.size.y - 1);
                printer.print_hline((0, 0), printer.size.x, "─");
                printer.print((0, 0), "┌");
                printer.print((printer.size.x - 1, 0), "┐");
                printer.print((0, lowest), "└");
                printer.print((printer.size.x - 1, lowest), "┘");
            }
            Placement::VerticalLeft => {
                // Side bar
                printer.print_vline((printer.size.x - 1, 0), printer.size.y, "│");
                // Top lines
                printer.print_hline((self.bar_size.x - 1, 0), printer.size.x, "─");
                printer.print_hline(
                    (self.bar_size.x - 1, printer.size.y - 1),
                    printer.size.x,
                    "─",
                );
                printer.print((self.bar_size.x - 1, 0), "┌");
                printer.print((printer.size.x - 1, 0), "┐");
                printer.print((self.bar_size.x - 1, printer.size.y - 1), "└");
                printer.print((printer.size.x - 1, printer.size.y - 1), "┘");
            }
            Placement::VerticalRight => {
                // Side bar
                printer.print_vline((0, 0), printer.size.y, "│");
                // Top lines
                printer.print_hline((0, 0), printer.size.x, "─");
                // 此处画线太远，需要用空格覆盖
                printer.print_hline((0, printer.size.y - 1), printer.size.x, "─");

                let right = clamp(printer.size.x - self.bar_size.x, 0, printer.size.x - 1);
                printer.print((0, 0), "┌");
                printer.print((right, 0), "┐");
                printer.print_hline((right + 1, 0), printer.size.x, " ");
                printer.print((0, printer.size.y - 1), "└");
                printer.print((right, printer.size.y - 1), "┘");
                printer.print_hline((right + 1, printer.size.y - 1), printer.size.x, " ");
            }
        }
    }

    fn on_event_focused(&mut self, evt: Event) -> EventResult {
        match self.bar.on_event(evt.relativized(match self.bar_placement {
            Placement::HorizontalTop | Placement::VerticalLeft => Vec2::new(0, 0),
            Placement::HorizontalBottom => self.tab_size.keep_y() + Vec2::new(0, 1),
            Placement::VerticalRight => self.tab_size.keep_x() + Vec2::new(1, 0),
        })) {
            EventResult::Consumed(cb) => EventResult::Consumed(cb),
            EventResult::Ignored => match evt {
                Event::Key(Key::Down) if self.bar_placement == Placement::HorizontalTop => {
                    if let Ok(result) = self.tabs.take_focus(Direction::up()) {
                        self.bar_focused = false;
                        result.and(EventResult::consumed())
                    } else {
                        EventResult::Ignored
                    }
                }
                Event::Key(Key::Up) if self.bar_placement == Placement::HorizontalBottom => {
                    if let Ok(result) = self.tabs.take_focus(Direction::down()) {
                        self.bar_focused = false;
                        result.and(EventResult::consumed())
                    } else {
                        EventResult::Ignored
                    }
                }
                Event::Key(Key::Left) if self.bar_placement == Placement::VerticalRight => {
                    if let Ok(result) = self.tabs.take_focus(Direction::right()) {
                        self.bar_focused = false;
                        result.and(EventResult::consumed())
                    } else {
                        EventResult::Ignored
                    }
                }
                Event::Key(Key::Right) if self.bar_placement == Placement::VerticalLeft => {
                    if let Ok(result) = self.tabs.take_focus(Direction::left()) {
                        self.bar_focused = false;
                        result.and(EventResult::consumed())
                    } else {
                        EventResult::Ignored
                    }
                }
                _ => EventResult::Ignored,
            },
        }
    }

    fn on_event_unfocused(&mut self, evt: Event) -> EventResult {
        match self
            .tabs
            .on_event(evt.relativized(match self.bar_placement {
                Placement::HorizontalTop => Vec2::new(1, self.bar_size.y),
                Placement::VerticalLeft => Vec2::new(self.bar_size.x, 1),
                Placement::HorizontalBottom | Placement::VerticalRight => Vec2::new(1, 1),
            })) {
            EventResult::Consumed(cb) => EventResult::Consumed(cb),
            EventResult::Ignored => match evt {
                Event::Key(Key::Up) if self.bar_placement == Placement::HorizontalTop => {
                    self.bar_focused = true;
                    EventResult::Consumed(None)
                }
                Event::Key(Key::Down) if self.bar_placement == Placement::HorizontalBottom => {
                    self.bar_focused = true;
                    EventResult::Consumed(None)
                }
                Event::Key(Key::Left) if self.bar_placement == Placement::VerticalLeft => {
                    self.bar_focused = true;
                    EventResult::Consumed(None)
                }
                Event::Key(Key::Right) if self.bar_placement == Placement::VerticalRight => {
                    self.bar_focused = true;
                    EventResult::Consumed(None)
                }
                _ => EventResult::Ignored,
            },
        }
    }

    fn check_focus_grab(&mut self, event: &Event) -> EventResult {
        if let Event::Mouse {
            offset,
            position,
            event,
        } = *event
        {
            debug!(
                "mouse event: offset: {:?} , position: {:?}",
                offset, position
            );
            if !event.grabs_focus() {
                return EventResult::Ignored;
            }

            match self.bar_placement {
                Placement::VerticalRight | Placement::HorizontalBottom => {
                    if position > offset && self.tab_size.fits(position - offset) {
                        if let Ok(res) = self.tabs.take_focus(Direction::none()) {
                            self.bar_focused = false;
                            return res;
                        }
                    } else {
                        self.bar_focused = true;
                    }
                }
                Placement::HorizontalTop | Placement::VerticalLeft => {
                    // Here we want conceptually position >= offset, which is what Vec2::fits does.
                    // (The actual >= means strictly > or strictly equal, which is not _quite_ what we want in 2D.)
                    if position.fits(offset)
                        && (self.bar_size - Vec2::new(1, 1)).fits(position - offset)
                    {
                        self.bar_focused = true;
                    } else if let Ok(res) = self.tabs.take_focus(Direction::none()) {
                        self.bar_focused = false;
                        return res;
                    }
                }
            }
        }
        EventResult::Ignored
    }
}

impl View for TabPanel {
    fn draw(&self, printer: &Printer) {
        self.draw_outer_panel(printer);
        let printer_bar = printer
            .offset(match self.bar_placement {
                Placement::HorizontalTop => (1, 0),
                Placement::HorizontalBottom => (
                    1,
                    clamp(printer.size.y - self.bar_size.y, 0, printer.size.y - 1),
                ),
                Placement::VerticalLeft => (0, 1),
                Placement::VerticalRight => (
                    clamp(printer.size.x - self.bar_size.x, 0, printer.size.x - 1),
                    1,
                ),
            })
            .cropped(match self.bar_placement {
                Placement::HorizontalTop | Placement::HorizontalBottom => {
                    (printer.size.x - 2, self.bar_size.y)
                }
                Placement::VerticalRight | Placement::VerticalLeft => {
                    (self.bar_size.x, printer.size.y - 2)
                }
            })
            .focused(self.bar_focused);
        let printer_tab = printer
            .offset(match self.bar_placement {
                Placement::VerticalLeft => (self.bar_size.x, 1),
                Placement::VerticalRight => (1, 1),
                Placement::HorizontalBottom => (1, 1),
                Placement::HorizontalTop => (1, self.bar_size.y),
            })
            // Inner area
            .cropped(match self.bar_placement {
                Placement::VerticalLeft | Placement::VerticalRight => {
                    (printer.size.x - self.bar_size.x - 1, printer.size.y - 2)
                }
                Placement::HorizontalBottom | Placement::HorizontalTop => {
                    (printer.size.x - 2, printer.size.y - self.bar_size.y - 1)
                }
            })
            .focused(!self.bar_focused);
        self.bar.draw(&printer_bar);
        self.tabs.draw(&printer_tab);
    }

    fn layout(&mut self, vec: Vec2) {
        self.bar.layout(match self.bar_placement {
            Placement::VerticalRight | Placement::VerticalLeft => {
                Vec2::new(self.bar_size.x, vec.y - 2)
            }
            Placement::HorizontalBottom | Placement::HorizontalTop => {
                Vec2::new(vec.x - 2, self.bar_size.y)
            }
        });
        self.tabs.layout(match self.bar_placement {
            Placement::VerticalRight | Placement::VerticalLeft => {
                self.tab_size = Vec2::new(vec.x - self.bar_size.x - 1, vec.y - 2);
                self.tab_size
            }
            Placement::HorizontalBottom | Placement::HorizontalTop => {
                self.tab_size = Vec2::new(vec.x - 2, vec.y - self.bar_size.y - 1);
                self.tab_size
            }
        });
    }

    fn needs_relayout(&self) -> bool {
        self.bar.needs_relayout() || self.tabs.needs_relayout()
    }

    fn required_size(&mut self, cst: Vec2) -> Vec2 {
        let tab_size = self.tabs.required_size(cst);
        self.bar_size = self.bar.required_size(cst);
        match self.bar_placement {
            Placement::HorizontalTop | Placement::HorizontalBottom => self
                .bar_size
                .stack_vertical(&tab_size)
                .stack_vertical(&Vec2::new(tab_size.x + 2, 1)),
            Placement::VerticalLeft | Placement::VerticalRight => self
                .bar_size
                .stack_horizontal(&tab_size)
                .stack_vertical(&Vec2::new(1, tab_size.y + 2)),
        }
    }

    fn on_event(&mut self, evt: Event) -> EventResult {
        let result = self.check_focus_grab(&evt);

        result.and(if self.bar_focused {
            self.on_event_focused(evt)
        } else {
            self.on_event_unfocused(evt)
        })
    }

    fn take_focus(&mut self, d: Direction) -> Result<EventResult, CannotFocus> {
        let tabs_take_focus = |panel: &mut TabPanel, d: Direction| {
            let result = panel.tabs.take_focus(d);

            if result.is_ok() {
                panel.bar_focused = false;
            } else {
                panel.bar_focused = true;
            }

            result
        };

        let mut result = Ok(EventResult::consumed());

        match self.bar_placement {
            Placement::HorizontalBottom => match d {
                Direction::Abs(Absolute::Up) => {
                    result = tabs_take_focus(self, d);
                }
                Direction::Abs(Absolute::Left) | Direction::Abs(Absolute::Right) => {
                    if !self.bar_focused {
                        result = tabs_take_focus(self, d);
                    }
                }
                Direction::Abs(Absolute::Down) => {
                    self.bar_focused = true;
                }
                _ => (),
            },
            Placement::HorizontalTop => match d {
                Direction::Abs(Absolute::Down) => {
                    result = tabs_take_focus(self, d);
                }
                Direction::Abs(Absolute::Left) | Direction::Abs(Absolute::Right) => {
                    if !self.bar_focused {
                        result = tabs_take_focus(self, d);
                    }
                }
                Direction::Abs(Absolute::Up) => {
                    self.bar_focused = true;
                }
                _ => (),
            },
            Placement::VerticalLeft => match d {
                Direction::Abs(Absolute::Right) => {
                    result = tabs_take_focus(self, d);
                }
                Direction::Abs(Absolute::Up) | Direction::Abs(Absolute::Down) => {
                    if !self.bar_focused {
                        result = tabs_take_focus(self, d);
                    }
                }
                Direction::Abs(Absolute::Left) => self.bar_focused = true,
                _ => {}
            },
            Placement::VerticalRight => match d {
                Direction::Abs(Absolute::Left) => {
                    result = tabs_take_focus(self, d);
                }
                Direction::Abs(Absolute::Up) | Direction::Abs(Absolute::Down) => {
                    if !self.bar_focused {
                        result = tabs_take_focus(self, d)
                    }
                }
                Direction::Abs(Absolute::Right) => self.bar_focused = true,
                _ => {}
            },
        }

        return Ok(result.unwrap_or(EventResult::Ignored));
    }

    fn focus_view(&mut self, slt: &Selector) -> Result<EventResult, ViewNotFound> {
        self.tabs.focus_view(slt)
    }

    fn call_on_any<'a>(&mut self, slt: &Selector, cb: AnyCb<'a>) {
        self.bar.call_on_any(slt, cb);
        self.tabs.call_on_any(slt, cb);
    }
}
