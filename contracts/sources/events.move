#[allow(unused_field)]
module one_portrait::events;

use sui::event;

public struct SubmittedEvent has copy, drop {
    unit_id: ID,
    athlete_id: u16,
    submitter: address,
    walrus_blob_id: vector<u8>,
    submission_no: u64,
    submitted_count: u64,
    max_slots: u64,
}

public struct UnitFilledEvent has copy, drop {
    unit_id: ID,
    athlete_id: u16,
    filled_count: u64,
    max_slots: u64,
}

public struct MosaicReadyEvent has copy, drop {
    unit_id: ID,
    athlete_id: u16,
    master_id: ID,
    mosaic_walrus_blob_id: vector<u8>,
}

public(package) fun emit_submitted(
    unit_id: ID,
    athlete_id: u16,
    submitter: address,
    walrus_blob_id: vector<u8>,
    submission_no: u64,
    submitted_count: u64,
    max_slots: u64,
) {
    event::emit(SubmittedEvent {
        unit_id,
        athlete_id,
        submitter,
        walrus_blob_id,
        submission_no,
        submitted_count,
        max_slots,
    });
}

public(package) fun emit_unit_filled(
    unit_id: ID,
    athlete_id: u16,
    filled_count: u64,
    max_slots: u64,
) {
    event::emit(UnitFilledEvent {
        unit_id,
        athlete_id,
        filled_count,
        max_slots,
    });
}

public(package) fun emit_mosaic_ready(
    unit_id: ID,
    athlete_id: u16,
    master_id: ID,
    mosaic_walrus_blob_id: vector<u8>,
) {
    event::emit(MosaicReadyEvent {
        unit_id,
        athlete_id,
        master_id,
        mosaic_walrus_blob_id,
    });
}

#[test_only]
public fun submitted_event_unit_id_for_testing(event: &SubmittedEvent): ID {
    event.unit_id
}

#[test_only]
public fun submitted_event_athlete_id_for_testing(event: &SubmittedEvent): u16 {
    event.athlete_id
}

#[test_only]
public fun submitted_event_submitter_for_testing(event: &SubmittedEvent): address {
    event.submitter
}

#[test_only]
public fun submitted_event_walrus_blob_id_for_testing(event: &SubmittedEvent): vector<u8> {
    copy event.walrus_blob_id
}

#[test_only]
public fun submitted_event_submission_no_for_testing(event: &SubmittedEvent): u64 {
    event.submission_no
}

#[test_only]
public fun submitted_event_submitted_count_for_testing(event: &SubmittedEvent): u64 {
    event.submitted_count
}

#[test_only]
public fun submitted_event_max_slots_for_testing(event: &SubmittedEvent): u64 {
    event.max_slots
}

#[test_only]
public fun unit_filled_event_unit_id_for_testing(event: &UnitFilledEvent): ID {
    event.unit_id
}

#[test_only]
public fun unit_filled_event_athlete_id_for_testing(event: &UnitFilledEvent): u16 {
    event.athlete_id
}

#[test_only]
public fun unit_filled_event_filled_count_for_testing(event: &UnitFilledEvent): u64 {
    event.filled_count
}

#[test_only]
public fun unit_filled_event_max_slots_for_testing(event: &UnitFilledEvent): u64 {
    event.max_slots
}

#[test_only]
public fun mosaic_ready_event_unit_id_for_testing(event: &MosaicReadyEvent): ID {
    event.unit_id
}

#[test_only]
public fun mosaic_ready_event_athlete_id_for_testing(event: &MosaicReadyEvent): u16 {
    event.athlete_id
}

#[test_only]
public fun mosaic_ready_event_master_id_for_testing(event: &MosaicReadyEvent): ID {
    event.master_id
}

#[test_only]
public fun mosaic_ready_event_mosaic_walrus_blob_id_for_testing(
    event: &MosaicReadyEvent,
): vector<u8> {
    copy event.mosaic_walrus_blob_id
}
