import { AppointmentsRepository } from "../repositories/appointments.repository";
import {
  getCustomRepository,
  getRepository,
  LessThan,
  MoreThan,
} from "typeorm";
import { Appointment, Patient, Professional } from "../entities";
import { Between } from "typeorm";
import ErrorHandler from "../utils/errors";
import {
  sendAppointmentEmail,
  sendCancelationEmail,
  sendPrescription,
} from "./email.service";
import {
  formatAppointmentsTomorrow,
  formatPatientAppointment,
  formatProfessionalAppointment,
  formatWaitList,
} from "../utils/functions";
import { PDFGenerator } from "../utils/pdfGeneretor";
import {
  sendCancelationWhatsapp,
  sendUpdateWhatsapp,
} from "./whatsapp.service";

export class CreateAppointmentService {
  async execute(data: Appointment, date: string, hour: string) {
    const patientRepo = getRepository(Patient);
    const proRepo = getRepository(Professional);
    const user = await patientRepo.findOne({ where: { cpf: data.patient } });
    const medic = await proRepo.findOne({
      where: { council_number: data.professional },
    });
    const appointmentsRepository = getCustomRepository(AppointmentsRepository);

    const newAppointment = appointmentsRepository.create(data);
    await appointmentsRepository.save(newAppointment);

    return newAppointment;
  }
}

export class AppointmentByPatientService {
  async execute(patientId: string) {
    const appointmentsRepository = getCustomRepository(AppointmentsRepository);
    const appointments = await appointmentsRepository.find({
      where: { patient: patientId },
      relations: ["patient", "professional"],
    });

    const result = formatPatientAppointment(appointments);

    return result;
  }
}

export class AppointmentByProfessionalService {
  async execute(professionalId: string) {
    const appointmentsRepository = getCustomRepository(AppointmentsRepository);

    const appointments = await appointmentsRepository.find({
      where: { professional: professionalId },
      relations: ["professional", "patient"],
    });

    const result = formatProfessionalAppointment(appointments);

    return result;
  }
}

export class AppointmentsTomorrowService {
  async execute() {
    const appointmentsRepository = getCustomRepository(AppointmentsRepository);
    const currentDate = new Date();
    const yearMonth =
      currentDate.getFullYear() +
      "-" +
      String(currentDate.getMonth() + 1).padStart(2, "0") +
      "-";
    const tomorrow =
      yearMonth + String(currentDate.getDate()).padStart(2, "0") + "T21:00";

    const endTomorrow =
      yearMonth + String(currentDate.getDate() + 1).padStart(2, "0") + "T20:59";

    const appointments = await appointmentsRepository.find({
      where: { date: Between(tomorrow, endTomorrow) },
      relations: ["professional", "patient"],
    });

    const result = formatAppointmentsTomorrow(appointments);

    return result;
  }
}

export class WaitListService {
  async execute(crm: String) {
    const appointmentsRepository = getCustomRepository(AppointmentsRepository);
    const currentDate = new Date();
    currentDate.setHours(currentDate.getHours() - 3);

    const lateAppointments = await appointmentsRepository.find({
      where: {
        professional: crm,
        finished: false,
        date: LessThan(currentDate),
      },
      relations: ["professional", "patient"],
    });

    const result = formatWaitList(lateAppointments);

    return result;
  }
}

export class UpdateAppointmentService {
  async execute(id: string, data: Appointment) {
    const appointmentsRepository = getCustomRepository(AppointmentsRepository);
    const date = data.date;

    await appointmentsRepository.update(id, data);

    const updatedAppointment = await appointmentsRepository.findOne(id, {
      relations: ["professional", "patient"],
    });

    if (!updatedAppointment) {
      throw new ErrorHandler("This appointment does not exist", 404);
    }

    const result = {
      id: updatedAppointment.id,
      date: updatedAppointment.date,
      professional: updatedAppointment.professional.council_number,
      patient: updatedAppointment.patient.cpf,
      finished: updatedAppointment.finished,
    };

    if (date) {
      const patientName: string = updatedAppointment?.patient.name;
      const patientPhone: string = updatedAppointment?.patient.phone;
      const professionalName: string = updatedAppointment?.professional.name;
      const professionalSpecialty: string =
        updatedAppointment?.professional.specialty;

      await sendUpdateWhatsapp(
        patientName,
        patientPhone,
        professionalName,
        professionalSpecialty,
        date
      );
    }

    return result;
  }
}

export class DeleteAppointmentService {
  async execute(id: string) {
    const appointmentsRepository = getCustomRepository(AppointmentsRepository);
    const patientRepo = getRepository(Patient);
    const proRepo = getRepository(Professional);

    const appointmentToDelete = await appointmentsRepository.findOne(id, {
      relations: ["professional", "patient"],
    });
    const user = await patientRepo.findOne({
      where: { cpf: appointmentToDelete?.patient.cpf },
    });
    const medic = await proRepo.findOne({
      where: {
        council_number: appointmentToDelete?.professional.council_number,
      },
    });
    const name: any = user?.name;
    const mail: any = user?.email;
    const phone: any = user?.phone;
    const medicName: any = medic?.name;
    const specialty: any = medic?.specialty;
    const date: any = appointmentToDelete?.date.toLocaleDateString();
    const hour: any = appointmentToDelete?.date.toLocaleTimeString();

    if (!appointmentToDelete) {
      throw new Error("This appointment does not exist");
    }

    await sendCancelationEmail(name, medicName, mail, specialty, date, hour);

    await sendCancelationWhatsapp(name, medicName, phone, specialty);

    const deletedAppointment = await appointmentsRepository.remove(
      appointmentToDelete
    );

    return deletedAppointment;
  }
}

export const prescriptionPdf = async (
  email: string,
  name: string,
  medicName: string,
  specialty: string
) => {
  try {
    PDFGenerator();

    await sendPrescription(email, name, medicName, specialty);
  } catch (err: any) {
    err;
  }
};
