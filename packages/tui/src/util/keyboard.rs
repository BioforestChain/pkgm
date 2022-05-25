pub mod shortcut {
    use std::cell::RefCell;
    use std::rc::Rc;

    use cursive::event::{Event, Key};
    use cursive::theme::{BaseColor, Color, PaletteColor, Theme};
    use cursive::view::{Nameable, Resizable};
    use cursive::views::{Dialog, DialogFocus, EditView, Layer, ThemedView, ViewRef};
    use cursive::{CursiveRunnable, With};

    use crate::ui::browser::Browser;
    use crate::ui::debug_panel::DebugPanel;
    use crate::util::consts::browser_name;

    fn dynamically_add_page(s: &mut cursive::Cursive, name: &str) {
        if name.is_empty() {
            s.add_layer(Dialog::info("Please enter a name!"));
        } else {
            s.pop_layer();

            s.call_on_name(browser_name::BROWSER, |browser: &mut Browser| {
                browser.add_page(name.to_string());
            });
        }
    }

    fn get_common_theme(s: &mut cursive::Cursive) -> Theme {
        let theme = s.current_theme().clone().with(|theme| {
            theme.palette[PaletteColor::View] = Color::Dark(BaseColor::Black);
            theme.palette[PaletteColor::Primary] = Color::Light(BaseColor::Green);
            theme.palette[PaletteColor::TitlePrimary] = Color::Light(BaseColor::Green);
            theme.palette[PaletteColor::Highlight] = Color::Dark(BaseColor::Green);
            theme.shadow = false;
        });

        theme
    }

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

        // 动态添加tab
        siv.add_global_callback(Event::Shift(Key::F1), |s| {
            let theme = get_common_theme(s);

            let dialog = Dialog::new()
                .title("Add new tab")
                .padding_lrtb(1, 1, 1, 0)
                .content(
                    EditView::new()
                        .on_submit(dynamically_add_page)
                        .with_name("name")
                        .fixed_width(20),
                )
                .button("Ok", |s| {
                    let name = s
                        .call_on_name("name", |view: &mut EditView| view.get_content())
                        .unwrap();
                    dynamically_add_page(s, &name);
                })
                .button("No", move |s| {
                    s.pop_layer();
                });
            s.add_layer(ThemedView::new(theme, Layer::new(dialog)));
        });

        // 添加debug面板
        siv.add_global_callback(Key::F12, |s| {
            let mut browser: ViewRef<Browser> = s.find_name(browser_name::BROWSER).unwrap();

            let current_index = browser.get_selected_index();

            let current_uri = browser.with_tabbar_mut(move |tabbar| {
                let mut uri = String::from("");

                for (index, tab) in tabbar.get_tabs().borrow().iter().enumerate() {
                    if index == current_index {
                        uri.push_str(tab.borrow_mut().get_id());
                        break;
                    }
                }

                uri
            });

            let debug_panel_name = current_uri + "::debug";
            if let Some(pos) = s.screen_mut().find_layer_from_name(&debug_panel_name) {
                s.screen_mut().remove_layer(pos);
            } else {
                s.screen_mut().add_layer(
                    DebugPanel::new(debug_panel_name.clone())
                        .with_name(&debug_panel_name)
                        .full_screen(),
                )
            }
        });

        // siv.add_global_callback(Key::Down, |s| {
        //     s.call_on_name(browser_name::BROWSER, |browser: &mut Browser| {
        //         browser.append_content("title".to_string());
        //     });
        // });

        siv.add_global_callback(Event::Shift(Key::Enter), |s| {
            s.call_on_name(browser_name::BROWSER, |browser: &mut Browser| {
                for _ in 0..100 {
                    browser.append_content("title".to_string());
                }
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

                let theme = get_common_theme(s);

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
