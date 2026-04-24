#[test_only]
module one_portrait::registry_admin_tests;

use std::unit_test::assert_eq;
use one_portrait::admin_api;
use one_portrait::kakera::Kakera;
use one_portrait::registry::{Self as registry, AdminCap, Registry};
use one_portrait::unit::{Self as unit, Unit};
use std::string::{Self as string};
use sui::display::{Self as display, Display};
use sui::package::Publisher;
use sui::test_scenario;
use sui::vec_map;

#[test]
fun init_creates_admin_cap_kakera_display_and_shared_registry() {
    let publisher = @0xA11CE;
    let mut scenario = test_scenario::begin(publisher);

    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let publisher = scenario.take_from_sender<Publisher>();
    let kakera_display = scenario.take_from_sender<Display<Kakera>>();
    let registry = scenario.take_shared<Registry>();

    assert_eq!(registry::unit_count_for_testing(&registry), 0);
    assert_eq!(display::version(&kakera_display), 1);
    assert_eq!(vec_map::length(display::fields(&kakera_display)), 4);
    assert_eq!(
        *vec_map::get(display::fields(&kakera_display), &string::utf8(b"name")),
        string::utf8(b"ONE Portrait Kakera #{submission_no}")
    );
    assert_eq!(
        *vec_map::get(display::fields(&kakera_display), &string::utf8(b"description")),
        string::utf8(b"Soulbound proof of participation in ONE Portrait.")
    );
    assert_eq!(
        *vec_map::get(display::fields(&kakera_display), &string::utf8(b"image_url")),
        string::utf8(b"https://one-portrait-web.bububutasan00.workers.dev/demo/demo_mozaiku.png")
    );
    assert_eq!(
        *vec_map::get(display::fields(&kakera_display), &string::utf8(b"project_url")),
        string::utf8(b"https://one-portrait-web.bububutasan00.workers.dev/")
    );

    scenario.return_to_sender(admin_cap);
    scenario.return_to_sender(publisher);
    scenario.return_to_sender(kakera_display);
    test_scenario::return_shared(registry);
    scenario.end();
}

#[test]
fun create_unit_sets_initial_state_and_appends_registry_index() {
    let publisher = @0xA11CE;
    let max_slots = 500;
    let display_max_slots = 2_000;
    let target_blob = b"target-blob";
    let display_name = b"Demo Athlete Seven";
    let thumbnail_url = b"https://example.com/7.png";

    let mut scenario = test_scenario::begin(publisher);
    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<Registry>();
    let unit_id = admin_api::create_unit(
        &admin_cap,
        &mut registry,
        display_name,
        thumbnail_url,
        target_blob,
        max_slots,
        display_max_slots,
        scenario.ctx(),
    );

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(registry);

    scenario.next_tx(publisher);

    let registry = scenario.take_shared<Registry>();
    let unit = scenario.take_shared_by_id<Unit>(unit_id);

    assert_eq!(object::id(&unit), unit_id);
    assert_eq!(unit::display_name_for_testing(&unit), display_name);
    assert_eq!(unit::thumbnail_url_for_testing(&unit), thumbnail_url);
    assert_eq!(unit::max_slots_for_testing(&unit), max_slots);
    assert_eq!(unit::display_max_slots_for_testing(&unit), display_max_slots);
    assert!(unit::is_pending_for_testing(&unit));
    assert!(!unit::has_master_for_testing(&unit));
    assert_eq!(unit::submitter_count_for_testing(&unit), 0);
    assert_eq!(unit::submission_count_for_testing(&unit), 0);
    assert_eq!(registry::unit_count_for_testing(&registry), 1);
    assert_eq!(registry::unit_id_for_testing(&registry, 0), unit_id);

    test_scenario::return_shared(unit);
    test_scenario::return_shared(registry);
    scenario.end();
}

#[test]
fun create_zero_submission_demo_unit_starts_filled() {
    let publisher = @0xA11CE;
    let max_slots = 0;
    let display_max_slots = 2_000;

    let mut scenario = test_scenario::begin(publisher);
    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<Registry>();
    let unit_id = admin_api::create_unit(
        &admin_cap,
        &mut registry,
        b"Demo Athlete Zero",
        b"https://example.com/0.png",
        b"target-blob-zero",
        max_slots,
        display_max_slots,
        scenario.ctx(),
    );

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(registry);

    scenario.next_tx(publisher);

    let registry = scenario.take_shared<Registry>();
    let unit = scenario.take_shared_by_id<Unit>(unit_id);

    assert_eq!(unit::max_slots_for_testing(&unit), max_slots);
    assert_eq!(unit::display_max_slots_for_testing(&unit), display_max_slots);
    assert!(unit::is_filled_for_testing(&unit));
    assert_eq!(unit::submitter_count_for_testing(&unit), 0);
    assert_eq!(unit::submission_count_for_testing(&unit), 0);
    assert_eq!(registry::unit_count_for_testing(&registry), 1);
    assert_eq!(registry::unit_id_for_testing(&registry, 0), unit_id);

    test_scenario::return_shared(unit);
    test_scenario::return_shared(registry);
    scenario.end();
}

#[test]
fun create_unit_keeps_existing_units_in_registry_order() {
    let publisher = @0xA11CE;

    let mut scenario = test_scenario::begin(publisher);
    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<Registry>();
    let first_unit_id = admin_api::create_unit(
        &admin_cap,
        &mut registry,
        b"Demo Athlete Nine",
        b"https://example.com/9.png",
        b"target-1",
        500,
        2_000,
        scenario.ctx(),
    );

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(registry);

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<Registry>();
    let second_unit_id = admin_api::create_unit(
        &admin_cap,
        &mut registry,
        b"Demo Athlete Nine Encore",
        b"https://example.com/9b.png",
        b"target-2",
        500,
        2_000,
        scenario.ctx(),
    );

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(registry);

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let registry = scenario.take_shared<Registry>();
    assert_eq!(registry::unit_count_for_testing(&registry), 2);
    assert_eq!(registry::unit_id_for_testing(&registry, 0), first_unit_id);
    assert_eq!(registry::unit_id_for_testing(&registry, 1), second_unit_id);

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(registry);
    scenario.end();
}

#[test]
fun admin_cap_is_only_held_by_initializer() {
    let publisher = @0xA11CE;
    let other = @0xB0B;

    let mut scenario = test_scenario::begin(publisher);
    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(other);

    assert!(test_scenario::has_most_recent_for_address<AdminCap>(publisher));
    assert!(!test_scenario::has_most_recent_for_address<AdminCap>(other));

    scenario.end();
}
