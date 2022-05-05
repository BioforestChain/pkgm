mod browser;
mod browser_content;
mod page;
mod page_tab;
mod tabbar;

use browser::*;
use core::cell::RefCell;
use cursive::event::Event;

use cursive::theme::{BaseColor, Color, PaletteColor, Theme};
use cursive::traits::*;
use cursive::views::DialogFocus;
use cursive::views::{Dialog, LinearLayout, TextView};
use cursive::{self, theme, views, With};

use std::rc::Rc;

// #![feature(cell_leak)]

fn main() {
    let mut siv: cursive::CursiveRunnable = cursive::default();
    let theme = siv
        .current_theme()
        .clone()
        .with(|theme| theme.shadow = false);
    siv.set_theme(theme);

    let mut browser = Browser::new("left".to_string());
    // browser.add_page("xxx", "xxxx\nyyyyy");
    browser.add_page("[1] tsc".to_owned());
    browser.add_page("[2] dev".to_owned());

    siv.add_fullscreen_layer(browser
        // LinearLayout::horizontal()
        //     // .with(|layout| {
        //     //     browser.map(move |tab, content, index, selected| {
        //     //         layout.add_child(TextView::new(tab));
        //     //     });
        //     // })
        //     .child(TextView::new("tab2"))
        //     .child(
        //         browser
        //             .fixed_width(10)
        //             .fixed_height(10),
        //     ),
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
