pub mod shortcut {
    use std::cell::RefCell;
    use std::rc::Rc;

    use cursive::event::{Event, Key};
    use cursive::theme::{BaseColor, Color, PaletteColor};
    use cursive::views::{Dialog, DialogFocus, Layer, ThemedView};
    use cursive::CursiveRunnable;
    use cursive::With;

    use crate::ui::browser::Browser;
    use crate::util::consts::browser_name;

    pub fn keyboard_bind(siv: &mut CursiveRunnable) {
        let mut i = 0;
        siv.add_global_callback('l', move |_| {
            log::trace!("{}", format!("Wooo-{}", i));
            i += 1;
        });

        // 自定义调试日志面板
        siv.add_global_callback('~', cursive::Cursive::toggle_debug_console);
        siv.add_global_callback(Key::Left, |s| {
            s.call_on_name(browser_name::BROWSER, |browser: &mut Browser| {
                browser.page_switch_decrement();
            });
        });
        siv.add_global_callback(Key::Right, |s| {
            s.call_on_name(browser_name::BROWSER, |browser: &mut Browser| {
                browser.page_switch_increment();
            });
        });

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
                s.add_layer(ThemedView::new(theme, Layer::new(dialog)));
            }
        });
    }
}
