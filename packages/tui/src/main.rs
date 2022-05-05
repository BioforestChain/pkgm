use core::cell::RefCell;
use cursive::event::Event;
use cursive::theme::{BaseColor, Color, PaletteColor, Theme};
use cursive::traits::*;
use cursive::views::DialogFocus;
use cursive::views::{Button, Dialog, LinearLayout, PaddedView, TextArea, TextView};
use cursive::{self, theme, views, With};
use tui::{Align, TabPanel};

use std::rc::Rc;

// #![feature(cell_leak)]
const TAB_0: &str =
    "With using the TabPanel you get a TabView and TabBar, preconfigured for you to use!
Simply create it with:

`cursive_tabs::TabPanel::new()`";

const TAB_1: &str = "You then can add views and configure your panel.";

const TAB_2: &str =
    "Ofcourse you can also use the provided TabView without the panel, simply create it with:

`cursive_tabs::TabView::new()`";

const TAB_3: &str = "All you have to do is add:

cursive-tabs = \"^0\"

to your Cargo.toml!
";

fn main() {
    let mut siv: cursive::CursiveRunnable = cursive::default();
    let theme = siv
        .current_theme()
        .clone()
        .with(|theme| theme.shadow = false);
    siv.set_theme(theme);

    let panel = TabPanel::new()
        .with_tab(TextView::new(TAB_0).with_name("0"))
        .with_tab(TextView::new(TAB_1).with_name("1"))
        .with_tab(TextView::new(TAB_2).with_name("2"))
        .with_tab(TextView::new(TAB_3).with_name("3"))
        .with_tab(PaddedView::lrtb(2, 2, 1, 1, TextArea::new()).with_name("4"))
        .with_bar_alignment(Align::End)
        .with_active_tab("0")
        .unwrap_or_else(|_| {
            panic!("无法将第一个选项卡设置为活动选项卡！ 这可能是 lib 中实现的问题！");
        });

    siv.add_fullscreen_layer(
        LinearLayout::vertical()
            .child(panel.with_name("Tabs").full_screen())
            .child(
                LinearLayout::horizontal()
                    .child(Button::new("Prev", |siv| {
                        let mut tabs: cursive::views::ViewRef<TabPanel> =
                            siv.find_name("Tabs").expect("id not found");
                        tabs.prev();
                    }))
                    .child(Button::new("Next", |siv| {
                        let mut tabs: cursive::views::ViewRef<TabPanel> =
                            siv.find_name("Tabs").expect("id not found");
                        tabs.next();
                    })),
            ),
    );
    // 调试
    cursive::logger::init();
    // Use some logging macros from the `log` crate.
    log::error!("Something serious probably happened!");
    log::warn!("Or did it?");
    log::debug!("Logger initialized.");
    log::info!("Starting!");

    let mut i = 0;
    siv.add_global_callback('l', move |_| {
        log::trace!("{}", format!("Wooo-{}", i));
        i += 1;
    });

    // 自定义调试日志面板
    siv.add_global_callback('~', cursive::Cursive::toggle_debug_console);

    // 自定义ctrl-c
    siv.clear_global_callbacks(Event::CtrlChar('c'));

    let showing_dialog = Rc::new(RefCell::new(false));

    siv.set_on_pre_event(Event::CtrlChar('c'), {
        move |s| {
            // double press ctrl-c
            if *showing_dialog.clone().borrow() {
                s.quit();
                return;
            }
            *showing_dialog.clone().borrow_mut() = true;

            let theme = s.current_theme().clone().with(|theme| {
                theme.palette[PaletteColor::View] = Color::Dark(BaseColor::Black);
                theme.palette[PaletteColor::Primary] = Color::Light(BaseColor::Green);
                theme.palette[PaletteColor::TitlePrimary] = Color::Light(BaseColor::Green);
                theme.palette[PaletteColor::Highlight] = Color::Dark(BaseColor::Green);
                theme.shadow = false;
            });

            let showing_dialog_no = showing_dialog.clone();
            let mut dialog = Dialog::text("Do you want to quit?")
                .button("Yes", |s| s.quit())
                .button("No", move |s| {
                    s.pop_layer();
                    *showing_dialog_no.clone().borrow_mut() = false;
                })
                .title("Tip!");
            dialog.set_focus(DialogFocus::Button(1));
            s.add_layer(views::ThemedView::new(theme, views::Layer::new(dialog)));
        }
    });

    siv.run();
}
