mod ui;
mod util;

use cursive;
use cursive::traits::Resizable;
use cursive::view::Nameable;

use ui::browser::Browser;
use util::consts::{browser_name, page_name, THEME_TOML};
use util::keyboard::shortcut;

fn main() {
    let mut siv: cursive::CursiveRunnable = cursive::default();
    cursive::logger::init();

    // 设置theme
    // siv.load_toml(include_str!("src/assets/theme.toml")).unwrap();
    siv.load_theme_file(THEME_TOML).unwrap();

    let browser = Browser::new(browser_name::BROWSER.to_string())
        .with_name(browser_name::BROWSER)
        .full_screen();

    // siv.add_layer(browser);
    siv.add_fullscreen_layer(browser);

    shortcut::keyboard_bind(&mut siv);

    siv.call_on_name(browser_name::BROWSER, |browser: &mut Browser| {
        browser.add_page(page_name::BUILD.to_string());
        browser.add_page(page_name::TUI.to_string());
        browser.add_page(page_name::DEPS.to_string());
    });

    // browser.with_name("browser");

    // siv.add_fullscreen_layer(browser
    //     // LinearLayout::horizontal()
    //     //     // .with(|layout| {
    //     //     //     browser.map(move |tab, content, index, selected| {
    //     //     //         layout.add_child(TextView::new(tab));
    //     //     //     });
    //     //     // })
    //     //     .child(TextView::new("tab2"))
    //     //     .child(
    //     //         browser
    //     //             .fixed_width(10)
    //     //             .fixed_height(10),
    //     //     ),
    // );

    // siv.add_layer(browser);
    // 调试
    // cursive::logger::init();
    // Use some logging macros from the `log` crate.
    // log::error!("Something serious probably happened!");
    // log::warn!("Or did it?");
    // log::debug!("Logger initialized.");
    // log::info!("Starting!");

    siv.run();
}
