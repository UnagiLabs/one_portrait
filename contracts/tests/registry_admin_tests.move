#[test_only]
module one_portrait::registry_admin_tests;

use std::unit_test::assert_eq;
use one_portrait::accessors;
use one_portrait::admin_api;
use one_portrait::registry::{Self, AdminCap, Registry};
use one_portrait::unit::{Self, Unit};
use sui::test_scenario;

#[test]
fun init_creates_admin_cap_and_shared_registry() {
    let publisher = @0xA11CE;
    let mut scenario = test_scenario::begin(publisher);

    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let registry = scenario.take_shared<Registry>();

    assert_eq!(registry::current_unit_count_for_testing(&registry), 0);
    assert_eq!(registry::athlete_metadata_count_for_testing(&registry), 0);
    assert_eq!(registry::slug_count_for_testing(&registry), 0);

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(registry);
    scenario.end();
}

#[test]
fun upsert_athlete_metadata_registers_updates_and_reads_metadata() {
    let publisher = @0xA11CE;
    let athlete_id = 7;

    let mut scenario = test_scenario::begin(publisher);
    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<Registry>();

    admin_api::upsert_athlete_metadata(
        &admin_cap,
        &mut registry,
        athlete_id,
        b"Demo Athlete Seven",
        b"demo-athlete-seven",
        b"https://example.com/7.png",
    );

    let initial = accessors::athlete_metadata(&registry, athlete_id).destroy_some();
    assert_eq!(
        registry::athlete_metadata_display_name_for_testing(&initial),
        b"Demo Athlete Seven",
    );
    assert_eq!(
        registry::athlete_metadata_slug_for_testing(&initial),
        b"demo-athlete-seven",
    );
    assert_eq!(
        registry::athlete_metadata_thumbnail_url_for_testing(&initial),
        b"https://example.com/7.png",
    );

    admin_api::upsert_athlete_metadata(
        &admin_cap,
        &mut registry,
        athlete_id,
        b"Demo Athlete Seven Updated",
        b"demo-athlete-seven-updated",
        b"https://example.com/7-updated.png",
    );

    let updated = accessors::athlete_metadata(&registry, athlete_id).destroy_some();
    assert_eq!(
        registry::athlete_metadata_display_name_for_testing(&updated),
        b"Demo Athlete Seven Updated",
    );
    assert_eq!(
        registry::athlete_metadata_slug_for_testing(&updated),
        b"demo-athlete-seven-updated",
    );
    assert_eq!(
        registry::athlete_metadata_thumbnail_url_for_testing(&updated),
        b"https://example.com/7-updated.png",
    );
    assert_eq!(registry::athlete_metadata_count_for_testing(&registry), 1);
    assert_eq!(registry::slug_count_for_testing(&registry), 1);

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(registry);
    scenario.end();
}

#[test, expected_failure(abort_code = registry::EDUPLICATE_SLUG)]
fun upsert_athlete_metadata_rejects_duplicate_slug() {
    let publisher = @0xA11CE;

    let mut scenario = test_scenario::begin(publisher);
    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<Registry>();

    admin_api::upsert_athlete_metadata(
        &admin_cap,
        &mut registry,
        7,
        b"Demo Athlete Seven",
        b"duplicate-slug",
        b"https://example.com/7.png",
    );
    admin_api::upsert_athlete_metadata(
        &admin_cap,
        &mut registry,
        8,
        b"Demo Athlete Eight",
        b"duplicate-slug",
        b"https://example.com/8.png",
    );

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(registry);
    scenario.end();
}

#[test]
fun create_unit_sets_initial_state_and_current_registry_entry() {
    let publisher = @0xA11CE;
    let athlete_id = 7;
    let max_slots = 500;
    let target_blob = b"target-blob";

    let mut scenario = test_scenario::begin(publisher);
    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<Registry>();
    let unit_id = admin_api::create_unit(
        &admin_cap,
        &mut registry,
        athlete_id,
        target_blob,
        max_slots,
        max_slots,
        scenario.ctx(),
    );

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(registry);

    scenario.next_tx(publisher);

    let registry = scenario.take_shared<Registry>();
    let unit = scenario.take_shared_by_id<Unit>(unit_id);

    assert_eq!(object::id(&unit), unit_id);
    assert_eq!(unit::athlete_id_for_testing(&unit), athlete_id);
    assert_eq!(unit::display_max_slots_for_testing(&unit), max_slots);
    assert_eq!(unit::max_slots_for_testing(&unit), max_slots);
    assert!(unit::is_pending_for_testing(&unit));
    assert!(!unit::has_master_for_testing(&unit));
    assert_eq!(unit::submitter_count_for_testing(&unit), 0);
    assert_eq!(unit::submission_count_for_testing(&unit), 0);
    assert_eq!(accessors::current_unit_id(&registry, athlete_id).destroy_some(), unit_id);

    test_scenario::return_shared(unit);
    test_scenario::return_shared(registry);
    scenario.end();
}

#[test]
fun create_demo_unit_keeps_distinct_display_max_slots() {
    let publisher = @0xA11CE;
    let athlete_id = 8;
    let max_slots = 5;
    let display_max_slots = 2000;

    let mut scenario = test_scenario::begin(publisher);
    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<Registry>();
    let unit_id = admin_api::create_unit(
        &admin_cap,
        &mut registry,
        athlete_id,
        b"target-blob",
        max_slots,
        display_max_slots,
        scenario.ctx(),
    );

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(registry);

    scenario.next_tx(publisher);

    let unit = scenario.take_shared_by_id<Unit>(unit_id);
    assert_eq!(unit::max_slots_for_testing(&unit), max_slots);
    assert_eq!(unit::display_max_slots_for_testing(&unit), display_max_slots);
    test_scenario::return_shared(unit);

    scenario.end();
}

#[test, expected_failure(abort_code = unit::EINVALID_DISPLAY_MAX_SLOTS)]
fun create_unit_rejects_display_max_slots_smaller_than_max_slots() {
    let publisher = @0xA11CE;

    let mut scenario = test_scenario::begin(publisher);
    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<Registry>();
    let _unit_id = admin_api::create_unit(
        &admin_cap,
        &mut registry,
        12,
        b"target-blob",
        5,
        4,
        scenario.ctx(),
    );

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(registry);
    scenario.end();
}

#[test]
fun rotate_current_unit_switches_registry_pointer_without_auto_rotating() {
    let publisher = @0xA11CE;
    let athlete_id = 9;

    let mut scenario = test_scenario::begin(publisher);
    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<Registry>();
    let first_unit_id = admin_api::create_unit(
        &admin_cap,
        &mut registry,
        athlete_id,
        b"target-1",
        500,
        500,
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
        athlete_id,
        b"target-2",
        500,
        500,
        scenario.ctx(),
    );

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(registry);

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<Registry>();
    let second_unit = scenario.take_shared_by_id<Unit>(second_unit_id);

    assert_eq!(
        accessors::current_unit_id(&registry, athlete_id).destroy_some(),
        first_unit_id
    );

    admin_api::rotate_current_unit(&admin_cap, &mut registry, athlete_id, &second_unit);

    assert_eq!(
        accessors::current_unit_id(&registry, athlete_id).destroy_some(),
        second_unit_id
    );

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(second_unit);
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
