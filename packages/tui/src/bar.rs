use crossbeam::channel::{Receiver, Sender};
use cursive::event::{Event, EventResult, Key, MouseButton, MouseEvent};
use cursive::theme::{Effect, PaletteColor};
use cursive::view::{View, ViewWrapper};
use cursive::views::Button;
use cursive::{wrap_impl, Printer, Vec2};
use log::debug;

use crate::panel::{Align, Placement};

/// Trait which defines which basic action a tab bar should be able to handle
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

pub struct TabBar {
    children: Vec<PositionWrap<Button>>,
    bar_size: Vec2,
    align: Align,
    last_rendered_size: Vec2,
    // List of accumulated sizes of prev buttons
    sizes: Vec<Vec2>,
    placement: Placement,
    cursor: Option<usize>,
    active: Option<usize>,
    rx: Receiver<String>,
    invalidated: bool,
}

impl TabBar {
    pub fn new(rx: Receiver<String>) -> Self {
        Self {
            children: Vec::new(),
            sizes: Vec::new(),
            cursor: None,
            active: None,
            align: Align::Start,
            placement: Placement::HorizontalTop,
            bar_size: Vec2::zero(),
            last_rendered_size: Vec2::zero(),
            rx,
            invalidated: true,
        }
    }

    pub fn with_alignment(mut self, align: Align) -> Self {
        self.align = align;
        self.invalidated = true;
        self
    }

    pub fn set_alignment(&mut self, align: Align) {
        self.align = align;
        self.invalidated = true;
    }

    pub fn with_placement(mut self, placement: Placement) -> Self {
        self.placement = placement;
        self.invalidated = true;
        self
    }

    pub fn set_placement(&mut self, placement: Placement) {
        self.placement = placement;
        self.invalidated = true;
    }

    fn decrement_idx(&mut self) -> EventResult {
        if let Some(index) = self.cursor {
            if index > 0 {
                self.cursor = Some(index - 1);
                self.invalidated = true;
                EventResult::Consumed(None)
            } else {
                EventResult::Ignored
            }
        } else {
            EventResult::Ignored
        }
    }

    fn increment_idx(&mut self) -> EventResult {
        if let Some(index) = self.cursor {
            if (index + 1) < self.children.len() {
                self.cursor = Some(index + 1);
                self.invalidated = true;
                EventResult::Consumed(None)
            } else {
                EventResult::Ignored
            }
        } else {
            EventResult::Ignored
        }
    }
}

impl Bar for TabBar {
    fn add_button(&mut self, tx: Sender<String>, key: &str) {
        let k = key.to_owned();
        let button = Button::new_raw(format!(" {} ", key), move |_| {
            debug!("send {}", k);
            match tx.send(k.clone()) {
                Ok(_) => {}
                Err(err) => {
                    debug!("button could not send key: {:?}", err);
                }
            }
        });
        self.children
            .push(PositionWrap::new(button, key.to_owned()));
        self.cursor = Some(self.children.len() - 1);
        self.active = Some(self.children.len() - 1);
        self.invalidated = true;
    }

    fn remove_button(&mut self, key: &str) {
        if let Some(pos) = self
            .children
            .iter()
            .enumerate()
            .filter_map(
                |(pos, button)| {
                    if button.key == *key {
                        Some(pos)
                    } else {
                        None
                    }
                },
            )
            .next()
        {
            if let Some(idx) = self.cursor {
                if idx == pos {
                    self.cursor = None;
                    self.active = None;
                }
            }
            self.children.remove(pos);
        }
        self.invalidated = true;
    }

    fn swap_button(&mut self, first: &str, second: &str) {
        let pos: Vec<usize> = self
            .children
            .iter()
            .enumerate()
            .filter_map(|(pos, button)| {
                if button.key == *first || button.key == *second {
                    Some(pos)
                } else {
                    None
                }
            })
            .collect();
        if let [pos1, pos2] = pos[..] {
            let child2 = self.children.remove(pos2);
            let child1 = self.children.remove(pos1);
            self.children.insert(pos1, child2);
            self.children.insert(pos2, child1);
        }
        self.invalidated = true;
    }

    fn add_button_at(&mut self, tx: Sender<String>, key: &str, pos: usize) {
        let k = key.to_owned();
        let button = Button::new_raw(format!(" {} ", key), move |_| {
            debug!("send {}", k);
            match tx.send(k.clone()) {
                Ok(_) => {}
                Err(err) => {
                    debug!("button could not send key: {:?}", err);
                }
            }
        });
        self.cursor = Some(pos);
        self.active = Some(pos);
        self.children
            .insert(pos, PositionWrap::new(button, key.to_owned()));
        self.invalidated = true;
    }
}

impl View for TabBar {
    fn draw(&self, printer: &Printer) {
        match self.placement {
            Placement::HorizontalBottom | Placement::HorizontalTop => {
                // First draw the complete horizontal line
                printer.print_hline((0, 0), printer.size.x, "─");
                // Spacing for padding & crop end
                let inner_printer = printer
                    // Alignment
                    .offset((
                        self.align
                            .get_offset(self.bar_size.x + self.children.len() + 1, printer.size.x),
                        0,
                    ));
                for (idx, child) in self.children.iter().enumerate() {
                    // There is no chainable api...
                    let mut rel_sizes = self.sizes.clone();
                    rel_sizes.truncate(idx);
                    let mut print = inner_printer
                        .offset(
                            rel_sizes
                                .iter()
                                .fold(Vec2::new(0, 0), |acc, x| acc.stack_horizontal(x))
                                .keep_x(),
                        )
                        // Spacing for first character
                        .offset((idx, 0))
                        .cropped({
                            if idx == 0 || idx == self.children.len() - 1 {
                                self.sizes[idx].stack_horizontal(&Vec2::new(2, 1))
                            } else {
                                self.sizes[idx].stack_horizontal(&Vec2::new(1, 1))
                            }
                        });
                    let mut theme = printer.theme.clone();

                    if !self.active.map_or(false, |active| idx == active) {
                        let color = theme.palette[PaletteColor::TitleSecondary];
                        theme.palette[PaletteColor::Primary] = color;
                    } else {
                        let color = theme.palette[PaletteColor::TitlePrimary];
                        theme.palette[PaletteColor::Primary] = color;
                    }

                    if let Some(focus) = self.cursor {
                        print = print.focused(focus == idx);
                    }

                    print.with_theme(&theme, |printer| {
                        if idx > 0 {
                            if self.active.map_or(false, |active| idx == active)
                                || self.active.map_or(false, |active| active == (idx - 1))
                            {
                                printer.print((0, 0), "┃")
                            } else {
                                printer.print((0, 0), "│");
                            }
                        } else if self.active.map_or(false, |active| idx == active) {
                            printer.print((0, 0), "┨")
                        } else {
                            printer.print((0, 0), "┤");
                        }
                        printer.with_effect(Effect::Bold, |printer| {
                            child.draw(&printer.offset((1, 0)))
                        });
                        if idx == self.children.len() - 1 {
                            if self.active.map_or(false, |active| idx == active) {
                                printer.offset((1, 0)).print(self.sizes[idx].keep_x(), "┠");
                            } else {
                                printer.offset((1, 0)).print(self.sizes[idx].keep_x(), "├");
                            }
                        }
                    });
                }
            }
            Placement::VerticalLeft | Placement::VerticalRight => {
                // First draw the complete vertical line
                let horizontal_offset = match self.placement {
                    Placement::VerticalLeft => printer.size.x - 1,
                    _ => 0,
                };
                printer.print_vline((horizontal_offset, 0), printer.size.y, "│");
                // Spacing for padding & crop end
                let inner_printer = printer
                    // Alignment
                    .offset((
                        0,
                        self.align
                            .get_offset(self.bar_size.y + self.children.len() + 1, printer.size.y),
                    ));
                for (idx, child) in self.children.iter().enumerate() {
                    // There is no chainable api...
                    let mut rel_sizes = self.sizes.clone();
                    rel_sizes.truncate(idx);
                    let mut print = inner_printer
                        // Move the printer to the position of the child, respecting the height of all previous ones
                        .offset(
                            rel_sizes
                                .iter()
                                .fold(Vec2::new(0, 0), |acc, x| acc.stack_vertical(x))
                                .keep_y(),
                        )
                        // Spacing for first character of the current one and all previous ones
                        .offset((0, idx))
                        // Offset so that the right side when aligned to the left is on the panel border
                        .offset((
                            if self.placement == Placement::VerticalLeft {
                                self.bar_size.x - self.sizes[idx].x
                            } else {
                                0
                            },
                            0,
                        ))
                        // Crop to size including the delimiters
                        .cropped({
                            if idx == 0 || idx == self.children.len() - 1 {
                                self.sizes[idx].stack_vertical(&Vec2::new(1, 2))
                            } else {
                                self.sizes[idx].stack_vertical(&Vec2::new(1, 1))
                            }
                        });
                    let mut theme = printer.theme.clone();

                    if !self.active.map_or(false, |active| idx == active) {
                        let color = theme.palette[PaletteColor::TitleSecondary];
                        theme.palette[PaletteColor::Primary] = color;
                    } else {
                        let color = theme.palette[PaletteColor::TitlePrimary];
                        theme.palette[PaletteColor::Primary] = color;
                    }

                    if let Some(focus) = self.cursor {
                        print = print.focused(focus == idx);
                    }
                    print.with_theme(&theme, |printer| {
                        if idx > 0 {
                            if self.active.map_or(false, |active| idx == active)
                                || self.active.map_or(false, |active| active == (idx - 1))
                            {
                                printer.print_hline((0, 0), printer.size.x, "━");
                            } else {
                                printer.print_hline((0, 0), printer.size.x, "─");
                            }
                        } else if self.active.map_or(false, |active| idx == active) {
                            printer.print_hline((0, 0), printer.size.x, "━");
                            printer.print((horizontal_offset, 0), "┷")
                        } else {
                            printer.print_hline((0, 0), printer.size.x, "─");
                            printer.print((horizontal_offset, 0), "┴");
                        }
                        printer.with_effect(Effect::Bold, |printer| {
                            child.draw(&printer.offset((0, 1)))
                        });
                        if idx == self.children.len() - 1 {
                            let (delim, connector) =
                                if self.active.map_or(false, |active| idx == active) {
                                    ("━", "┯")
                                } else {
                                    ("─", "┬")
                                };
                            printer.print_hline((0, printer.size.y - 1), printer.size.x, delim);
                            printer.print(
                                self.sizes[idx].keep_y() + Vec2::new(horizontal_offset, 1),
                                connector,
                            );
                        }
                    });
                }
            }
        }
    }

    fn layout(&mut self, vec: Vec2) {
        self.invalidated = false;
        for (child, size) in self.children.iter_mut().zip(self.sizes.iter()) {
            child.layout(*size);
        }
        self.last_rendered_size = vec;
    }

    fn needs_relayout(&self) -> bool {
        self.invalidated
    }

    fn required_size(&mut self, cst: Vec2) -> Vec2 {
        while self.rx.len() > 1 {
            // Discard old messages
            // This may happen if more than one view gets added to before the event loop of cursive gets started, resulting
            // in an incorrect start state
            match self.rx.try_recv() {
                Ok(_) => debug!("Got too many requests dropping some..."),
                Err(e) => debug!("Other side got dropped {:?}, ignoring this error", e),
            }
        }
        if let Ok(new_active) = self.rx.try_recv() {
            self.invalidated = true;
            for (idx, child) in self.children.iter().enumerate() {
                if new_active == child.key {
                    self.active = Some(idx);
                }
            }
        }
        self.sizes.clear();
        let sizes = &mut self.sizes;
        let placement = self.placement;
        if self.children.is_empty() {
            return Vec2::new(1, 1);
        }
        let total_size = self
            .children
            .iter_mut()
            .fold(Vec2::zero(), |mut acc, child| {
                let size = child.required_size(cst);
                match placement {
                    Placement::HorizontalBottom | Placement::HorizontalTop => {
                        acc = acc.stack_horizontal(&size);
                    }
                    Placement::VerticalLeft | Placement::VerticalRight => {
                        acc = acc.stack_vertical(&size);
                    }
                }
                child.pos = acc;
                sizes.push(size);
                acc
            });
        // Total size of bar
        self.bar_size = total_size;
        // Return max width and maximum height of child
        // We need the max size of every side here so try again
        match self.placement {
            Placement::HorizontalTop | Placement::HorizontalBottom => {
                (total_size.x * 2, total_size.y).into()
            }
            Placement::VerticalLeft | Placement::VerticalRight => {
                (total_size.x, total_size.y * 2).into()
            }
        }
    }

    fn on_event(&mut self, evt: Event) -> EventResult {
        if let Event::Mouse {
            offset,
            position,
            event,
        } = evt
        {
            for (idx, child) in self.children.iter().peekable().enumerate() {
                if position.checked_sub(offset).is_some()
                    && (match self.placement {
                        Placement::HorizontalBottom | Placement::HorizontalTop => {
                            child.pos
                                + Vec2::new(idx + 1, 0)
                                + Vec2::new(
                                    self.align.get_offset(
                                        // Length of buttons and delimiting characters
                                        self.bar_size.x + self.children.len() + 1,
                                        self.last_rendered_size.x,
                                    ),
                                    0,
                                )
                        }
                        Placement::VerticalLeft | Placement::VerticalRight => {
                            child.pos
                                + Vec2::new(0, idx + 1)
                                + Vec2::new(
                                    0,
                                    self.align.get_offset(
                                        // Length of buttons and delimiting characters
                                        self.bar_size.y + self.children.len() + 1,
                                        self.last_rendered_size.y,
                                    ),
                                )
                        }
                    })
                    .fits(position - offset)
                {
                    if let MouseEvent::Release(MouseButton::Left) = event {
                        self.invalidated = true;
                        self.cursor = Some(idx);
                        return self.children[idx].on_event(Event::Key(Key::Enter));
                    }
                }
            }
        }

        if let Some(focus) = self.cursor {
            let pos = self.children[focus].pos;

            if let EventResult::Consumed(any) = self.children[focus].on_event(evt.relativized(pos))
            {
                self.invalidated = true;
                return EventResult::Consumed(any);
            }
        }

        match evt {
            Event::Key(Key::Left)
                if self.placement == Placement::HorizontalBottom
                    || self.placement == Placement::HorizontalTop =>
            {
                self.decrement_idx()
            }
            Event::Key(Key::Up)
                if self.placement == Placement::VerticalLeft
                    || self.placement == Placement::VerticalRight =>
            {
                self.decrement_idx()
            }
            Event::Key(Key::Right)
                if self.placement == Placement::HorizontalBottom
                    || self.placement == Placement::HorizontalTop =>
            {
                self.increment_idx()
            }
            Event::Key(Key::Down)
                if self.placement == Placement::VerticalLeft
                    || self.placement == Placement::VerticalRight =>
            {
                self.increment_idx()
            }
            _ => EventResult::Ignored,
        }
    }
}
