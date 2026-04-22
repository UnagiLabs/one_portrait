#[test_only]
module one_portrait::submit_photo_tests;

use std::unit_test::assert_eq;
use one_portrait::accessors;
use one_portrait::admin_api;
use one_portrait::events::{Self as portrait_events};
use one_portrait::kakera::{Self as kakera, Kakera};
use one_portrait::registry::{Self as registry, AdminCap, Registry};
use one_portrait::unit::{Self, Unit};
use sui::clock::{Self as clock, Clock};
use sui::event;
use sui::test_scenario;

#[test]
fun submit_photo_mints_kakera_records_submission_and_emits_event() {
    let publisher = @0xA11CE;
    let submitter = @0xF0A;
    let athlete_id = 11;
    let max_slots = 500;
    let target_blob = b"target-blob";
    let walrus_blob_id = b"photo-blob";
    let now_ms = 1_717_071_568_899;

    let mut scenario = test_scenario::begin(publisher);
    test_scenario::create_system_objects(&mut scenario);
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
        scenario.ctx(),
    );

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(registry);

    scenario.next_tx(publisher);

    let mut clock = scenario.take_shared<Clock>();
    clock::set_for_testing(&mut clock, now_ms);
    test_scenario::return_shared(clock);

    scenario.next_tx(submitter);

    let mut unit = scenario.take_shared_by_id<Unit>(unit_id);
    let clock = scenario.take_shared<Clock>();

    accessors::submit_photo(&mut unit, walrus_blob_id, &clock, scenario.ctx());

    assert!(unit::is_pending_for_testing(&unit));
    assert_eq!(unit::submitter_count_for_testing(&unit), 1);
    assert_eq!(unit::submission_count_for_testing(&unit), 1);

    let submission = unit::submission_ref_for_testing(&unit, 0);
    assert_eq!(unit::submission_ref_submission_no_for_testing(&submission), 1);
    assert_eq!(unit::submission_ref_submitter_for_testing(&submission), submitter);
    assert_eq!(
        unit::submission_ref_walrus_blob_id_for_testing(&submission),
        walrus_blob_id
    );
    assert_eq!(unit::submission_ref_submitted_at_ms_for_testing(&submission), now_ms);

    assert_eq!(event::num_events(), 1);
    let submitted_events = event::events_by_type<portrait_events::SubmittedEvent>();
    assert_eq!(submitted_events.length(), 1);
    let submitted_event = submitted_events[0];
    assert_eq!(portrait_events::submitted_event_unit_id_for_testing(&submitted_event), unit_id);
    assert_eq!(
        portrait_events::submitted_event_athlete_id_for_testing(&submitted_event),
        athlete_id
    );
    assert_eq!(
        portrait_events::submitted_event_submitter_for_testing(&submitted_event),
        submitter
    );
    assert_eq!(
        portrait_events::submitted_event_walrus_blob_id_for_testing(&submitted_event),
        walrus_blob_id
    );
    assert_eq!(
        portrait_events::submitted_event_submission_no_for_testing(&submitted_event),
        1
    );
    assert_eq!(
        portrait_events::submitted_event_submitted_count_for_testing(&submitted_event),
        1
    );
    assert_eq!(
        portrait_events::submitted_event_max_slots_for_testing(&submitted_event),
        max_slots
    );

    test_scenario::return_shared(clock);
    test_scenario::return_shared(unit);

    let effects = scenario.next_tx(submitter);
    assert_eq!(effects.num_user_events(), 1);

    let kakera = scenario.take_from_sender<Kakera>();
    assert_eq!(kakera::unit_id_for_testing(&kakera), unit_id);
    assert_eq!(kakera::athlete_id_for_testing(&kakera), athlete_id);
    assert_eq!(kakera::submitter_for_testing(&kakera), submitter);
    assert_eq!(kakera::walrus_blob_id_for_testing(&kakera), walrus_blob_id);
    assert_eq!(kakera::submission_no_for_testing(&kakera), 1);
    assert_eq!(kakera::minted_at_ms_for_testing(&kakera), now_ms);
    scenario.return_to_sender(kakera);

    scenario.next_tx(publisher);

    let unit = scenario.take_shared_by_id<Unit>(unit_id);
    assert!(unit::is_pending_for_testing(&unit));
    assert_eq!(unit::submitter_count_for_testing(&unit), 1);
    assert_eq!(unit::submission_count_for_testing(&unit), 1);
    test_scenario::return_shared(unit);

    scenario.end();
}

#[test, expected_failure(abort_code = unit::EALREADY_SUBMITTED)]
fun submit_photo_rejects_duplicate_submission_from_same_sender() {
    let publisher = @0xA11CE;
    let submitter = @0xF0A;
    let athlete_id = 12;

    let mut scenario = test_scenario::begin(publisher);
    test_scenario::create_system_objects(&mut scenario);
    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<Registry>();
    let unit_id = admin_api::create_unit(
        &admin_cap,
        &mut registry,
        athlete_id,
        b"target-blob",
        500,
        scenario.ctx(),
    );

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(registry);

    scenario.next_tx(publisher);

    let mut clock = scenario.take_shared<Clock>();
    clock::set_for_testing(&mut clock, 42);
    test_scenario::return_shared(clock);

    scenario.next_tx(submitter);

    let mut unit = scenario.take_shared_by_id<Unit>(unit_id);
    let clock = scenario.take_shared<Clock>();
    accessors::submit_photo(&mut unit, b"photo-1", &clock, scenario.ctx());
    test_scenario::return_shared(clock);
    test_scenario::return_shared(unit);

    scenario.next_tx(submitter);

    let mut unit = scenario.take_shared_by_id<Unit>(unit_id);
    let clock = scenario.take_shared<Clock>();
    accessors::submit_photo(&mut unit, b"photo-2", &clock, scenario.ctx());
    test_scenario::return_shared(clock);
    test_scenario::return_shared(unit);

    scenario.end();
}

#[test]
fun submit_photo_marks_unit_filled_and_emits_unit_filled_event_on_last_slot() {
    let publisher = @0xA11CE;
    let first_submitter = @0xF01;
    let second_submitter = @0xF02;
    let athlete_id = 13;
    let max_slots = 2;

    let mut scenario = test_scenario::begin(publisher);
    test_scenario::create_system_objects(&mut scenario);
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
        scenario.ctx(),
    );

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(registry);

    scenario.next_tx(first_submitter);

    let mut unit = scenario.take_shared_by_id<Unit>(unit_id);
    let clock = scenario.take_shared<Clock>();
    accessors::submit_photo(&mut unit, b"photo-1", &clock, scenario.ctx());

    assert!(unit::is_pending_for_testing(&unit));
    assert_eq!(event::events_by_type<portrait_events::UnitFilledEvent>().length(), 0);

    test_scenario::return_shared(clock);
    test_scenario::return_shared(unit);

    let first_effects = scenario.next_tx(first_submitter);
    assert_eq!(first_effects.num_user_events(), 1);
    let first_kakera = scenario.take_from_sender<Kakera>();
    scenario.return_to_sender(first_kakera);

    scenario.next_tx(second_submitter);

    let mut unit = scenario.take_shared_by_id<Unit>(unit_id);
    let clock = scenario.take_shared<Clock>();
    accessors::submit_photo(&mut unit, b"photo-2", &clock, scenario.ctx());

    assert!(unit::is_filled_for_testing(&unit));
    assert_eq!(unit::submission_count_for_testing(&unit), max_slots);
    assert_eq!(event::num_events(), 2);

    let filled_events = event::events_by_type<portrait_events::UnitFilledEvent>();
    assert_eq!(filled_events.length(), 1);
    let filled_event = filled_events[0];
    assert_eq!(portrait_events::unit_filled_event_unit_id_for_testing(&filled_event), unit_id);
    assert_eq!(
        portrait_events::unit_filled_event_athlete_id_for_testing(&filled_event),
        athlete_id
    );
    assert_eq!(
        portrait_events::unit_filled_event_filled_count_for_testing(&filled_event),
        max_slots
    );
    assert_eq!(
        portrait_events::unit_filled_event_max_slots_for_testing(&filled_event),
        max_slots
    );

    test_scenario::return_shared(clock);
    test_scenario::return_shared(unit);

    let second_effects = scenario.next_tx(second_submitter);
    assert_eq!(second_effects.num_user_events(), 2);
    let second_kakera = scenario.take_from_sender<Kakera>();
    scenario.return_to_sender(second_kakera);

    scenario.next_tx(publisher);

    let unit = scenario.take_shared_by_id<Unit>(unit_id);
    assert!(unit::is_filled_for_testing(&unit));
    assert_eq!(unit::submission_count_for_testing(&unit), max_slots);
    test_scenario::return_shared(unit);

    scenario.end();
}

#[test, expected_failure(abort_code = unit::EUNIT_NOT_PENDING)]
fun submit_photo_rejects_submission_after_unit_is_filled() {
    let publisher = @0xA11CE;
    let first_submitter = @0xF11;
    let second_submitter = @0xF12;
    let third_submitter = @0xF13;
    let athlete_id = 14;

    let mut scenario = test_scenario::begin(publisher);
    test_scenario::create_system_objects(&mut scenario);
    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<Registry>();
    let unit_id = admin_api::create_unit(
        &admin_cap,
        &mut registry,
        athlete_id,
        b"target-blob",
        2,
        scenario.ctx(),
    );

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(registry);

    scenario.next_tx(first_submitter);

    let mut unit = scenario.take_shared_by_id<Unit>(unit_id);
    let clock = scenario.take_shared<Clock>();
    accessors::submit_photo(&mut unit, b"photo-1", &clock, scenario.ctx());
    test_scenario::return_shared(clock);
    test_scenario::return_shared(unit);

    scenario.next_tx(second_submitter);

    let mut unit = scenario.take_shared_by_id<Unit>(unit_id);
    let clock = scenario.take_shared<Clock>();
    accessors::submit_photo(&mut unit, b"photo-2", &clock, scenario.ctx());
    test_scenario::return_shared(clock);
    test_scenario::return_shared(unit);

    scenario.next_tx(third_submitter);

    let mut unit = scenario.take_shared_by_id<Unit>(unit_id);
    let clock = scenario.take_shared<Clock>();
    accessors::submit_photo(&mut unit, b"photo-3", &clock, scenario.ctx());
    test_scenario::return_shared(clock);
    test_scenario::return_shared(unit);

    scenario.end();
}

#[test, expected_failure(abort_code = unit::EDUPLICATE_BLOB_ID)]
fun submit_photo_rejects_duplicate_blob_id_from_different_submitter() {
    let publisher = @0xA11CE;
    let first_submitter = @0xF41;
    let second_submitter = @0xF42;
    let blob_id = b"shared-blob";

    let mut scenario = test_scenario::begin(publisher);
    test_scenario::create_system_objects(&mut scenario);
    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(publisher);
    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<Registry>();
    let unit_id = admin_api::create_unit(
        &admin_cap,
        &mut registry,
        18,
        b"target-blob",
        3,
        scenario.ctx(),
    );
    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(registry);

    scenario.next_tx(first_submitter);
    let mut unit = scenario.take_shared_by_id<Unit>(unit_id);
    let clock = scenario.take_shared<Clock>();
    accessors::submit_photo(&mut unit, blob_id, &clock, scenario.ctx());
    test_scenario::return_shared(clock);
    test_scenario::return_shared(unit);
    let first_effects = scenario.next_tx(first_submitter);
    assert_eq!(first_effects.num_user_events(), 1);
    let first_kakera = scenario.take_from_sender<Kakera>();
    scenario.return_to_sender(first_kakera);

    scenario.next_tx(second_submitter);
    let mut unit = scenario.take_shared_by_id<Unit>(unit_id);
    let clock = scenario.take_shared<Clock>();
    accessors::submit_photo(&mut unit, blob_id, &clock, scenario.ctx());
    test_scenario::return_shared(clock);
    test_scenario::return_shared(unit);
    scenario.end();
}
